import * as fs from 'node:fs'
import * as path from 'node:path'
import type { JsonObject, JsonValue } from '../../types/asl'

export interface CloudFormationTemplate {
  AWSTemplateFormatVersion?: string
  Description?: string
  Resources: Record<string, CloudFormationResource>
  Outputs?: JsonObject
}

interface CloudFormationResource {
  Type: string
  Properties: JsonObject
  DependsOn?: string | string[]
  Condition?: string
}

export interface StateMachineExtraction {
  stateMachineName: string
  logicalId: string
  definition: JsonObject // ASL定義のJSON（StateMachine型ではなく生のJSON）
  roleArn?: string
  originalDefinition: JsonValue
}

/**
 * CloudFormation テンプレートからStep Functions ステートマシンを抽出
 */
export class CloudFormationParser {
  extractStateMachines(template: CloudFormationTemplate): StateMachineExtraction[] {
    const stateMachines: StateMachineExtraction[] = []

    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      if (resource.Type === 'AWS::StepFunctions::StateMachine') {
        try {
          const extraction = this.extractStateMachine(logicalId, resource)
          if (extraction) {
            stateMachines.push(extraction)
          }
        } catch (error) {
          console.warn(`Failed to extract state machine ${logicalId}:`, error)
        }
      }
    }

    return stateMachines
  }

  // 完全一致で見つからない場合は前方一致で検索
  extractStateMachineById(
    template: CloudFormationTemplate,
    logicalId: string,
  ): StateMachineExtraction | null {
    // 1. 完全一致を試す
    const exactMatch = this.findExactStateMachine(template, logicalId)
    if (exactMatch) {
      return exactMatch
    }

    // 2. 前方一致で検索
    const prefixMatch = this.findPrefixStateMachine(template, logicalId)
    if (prefixMatch) {
      return prefixMatch
    }

    // 3. マッチしなかった場合はエラー
    const availableStateMachines = this.listStateMachineLogicalIds(template)
    throw new Error(
      `State machine '${logicalId}' not found. ` +
        `Available state machines: ${availableStateMachines.join(', ') || 'none'}`,
    )
  }

  private findExactStateMachine(
    template: CloudFormationTemplate,
    logicalId: string,
  ): StateMachineExtraction | null {
    const resource = template.Resources[logicalId]
    if (resource && resource.Type === 'AWS::StepFunctions::StateMachine') {
      return this.extractStateMachine(logicalId, resource)
    }
    return null
  }

  private findPrefixStateMachine(
    template: CloudFormationTemplate,
    prefix: string,
  ): StateMachineExtraction | null {
    const prefixMatches = Object.keys(template.Resources)
      .filter((key) => key.startsWith(prefix))
      .filter((key) => template.Resources[key]?.Type === 'AWS::StepFunctions::StateMachine')
      .sort() // 一貫した順序でソート

    if (prefixMatches.length > 0) {
      const matchedId = prefixMatches[0]
      if (matchedId) {
        const resource = template.Resources[matchedId]
        if (resource) {
          return this.extractStateMachine(matchedId, resource)
        }
      }
    }

    return null
  }

  private listStateMachineLogicalIds(template: CloudFormationTemplate): string[] {
    return Object.keys(template.Resources)
      .filter((key) => template.Resources[key]?.Type === 'AWS::StepFunctions::StateMachine')
      .sort()
  }

  private extractStateMachine(
    logicalId: string,
    resource: CloudFormationResource,
  ): StateMachineExtraction | null {
    const properties = resource.Properties

    if (!(properties.DefinitionString || properties.Definition)) {
      console.warn(`State machine ${logicalId} has no definition`)
      return null
    }

    // DefinitionString または Definition から ASL を取得
    let aslDefinition: JsonValue | undefined

    if (properties.DefinitionString) {
      aslDefinition = this.parseDefinitionString(properties.DefinitionString)
    } else if (properties.Definition) {
      aslDefinition = this.resolveIntrinsicFunctions(properties.Definition)
    }

    if (!aslDefinition || typeof aslDefinition !== 'object' || Array.isArray(aslDefinition)) {
      console.warn(`Invalid ASL definition for state machine ${logicalId}`)
      return null
    }

    if (!(aslDefinition.StartAt && aslDefinition.States)) {
      console.warn(`Invalid ASL definition for state machine ${logicalId}`)
      return null
    }

    const stateMachineName =
      typeof properties.StateMachineName === 'string' ? properties.StateMachineName : logicalId
    const roleArn = typeof properties.RoleArn === 'string' ? properties.RoleArn : undefined

    return {
      stateMachineName,
      logicalId,
      definition: aslDefinition,
      roleArn,
      originalDefinition: properties.DefinitionString || properties.Definition,
    }
  }

  // JSON文字列 または CloudFormation組み込み関数を解析
  private parseDefinitionString(definitionString: JsonValue): JsonValue {
    if (typeof definitionString === 'string') {
      try {
        const parsed = JSON.parse(definitionString) as JsonValue
        return this.resolveIntrinsicFunctions(parsed)
      } catch (error) {
        throw new Error(`Invalid JSON in DefinitionString: ${error}`)
      }
    }

    return this.resolveIntrinsicFunctions(definitionString)
  }

  private resolveIntrinsicFunctions(value: JsonValue): JsonValue {
    if (typeof value !== 'object' || value === null) {
      if (typeof value === 'string' && value.includes('arn:resolved-')) {
        return this.normalizeResolvedArn(value)
      }
      return value
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveIntrinsicFunctions(item))
    }

    if ('Fn::Join' in value) {
      const fnJoinValue = (value as JsonObject)['Fn::Join']
      if (!Array.isArray(fnJoinValue) || fnJoinValue.length !== 2) {
        return value
      }
      const [delimiter, values] = fnJoinValue as [string, JsonValue[]]
      if (typeof delimiter !== 'string' || !Array.isArray(values)) {
        return value
      }
      const resolvedValues = values.map((v) => this.resolveIntrinsicFunctions(v))
      const joined = resolvedValues.join(delimiter)

      // 結果がJSON文字列の場合はパース
      if (joined.trim().startsWith('{')) {
        try {
          return JSON.parse(joined) as JsonValue
        } catch {
          return joined
        }
      }
      return joined
    }

    if ('Fn::Sub' in value) {
      let template: string
      let variables: JsonObject = {}

      const fnSubValue = value['Fn::Sub']
      if (Array.isArray(fnSubValue)) {
        if (fnSubValue.length !== 2) {
          return value
        }
        const [templateValue, varsValue] = fnSubValue
        if (
          typeof templateValue !== 'string' ||
          typeof varsValue !== 'object' ||
          varsValue === null ||
          Array.isArray(varsValue)
        ) {
          return value
        }
        template = templateValue
        variables = varsValue
      } else if (typeof fnSubValue === 'string') {
        template = fnSubValue
      } else {
        return value
      }

      // 変数置換
      let result = template
      for (const [key, val] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(val))
      }

      // AWS疑似パラメータの置換
      result = result.replace(/\$\{AWS::AccountId\}/g, '123456789012')
      result = result.replace(/\$\{AWS::Region\}/g, 'us-east-1')
      result = result.replace(/\$\{AWS::StackName\}/g, 'test-stack')
      result = result.replace(/\$\{AWS::Partition\}/g, 'aws')

      // 結果がJSON文字列の場合はパース
      if (result.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(result) as JsonValue
          return this.resolveIntrinsicFunctions(parsed)
        } catch {
          // JSONでない場合、文字列にARN正規化を適用
          if (result.includes('arn:resolved-')) {
            return this.normalizeResolvedArn(result)
          }
          return result
        }
      }

      // JSONでない場合、文字列にARN正規化を適用
      if (result.includes('arn:resolved-')) {
        return this.normalizeResolvedArn(result)
      }
      return result
    }

    if ('Ref' in value) {
      const refValue = value.Ref as string
      // AWS疑似パラメータ
      switch (refValue) {
        case 'AWS::AccountId':
          return '123456789012'
        case 'AWS::Region':
          return 'us-east-1'
        case 'AWS::StackName':
          return 'test-stack'
        case 'AWS::Partition':
          return 'aws'
        default:
          // ARN形式の場合は特別処理
          if (refValue === 'AWS::Partition' || refValue.includes('Partition')) {
            return 'aws'
          }
          return `resolved-${refValue}`
      }
    }

    if ('Fn::GetAtt' in value) {
      const fnGetAttValue = value['Fn::GetAtt']
      if (!Array.isArray(fnGetAttValue) || fnGetAttValue.length !== 2) {
        return value
      }
      const [resource, attribute] = fnGetAttValue
      if (typeof resource !== 'string' || typeof attribute !== 'string') {
        return value
      }
      // ARN関連の属性は正規化
      const result = `resolved-${resource}-${attribute}`
      if (result.includes('arn:resolved-')) {
        return this.normalizeResolvedArn(result)
      }
      return result
    }

    const resolved: JsonObject = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = this.resolveIntrinsicFunctions(val)
    }

    return resolved
  }

  // ARN正規化パターン:
  // arn:resolved-AWS::Partition:states::: -> arn:aws:states:::
  // arn:resolved-Custom::Partition:states::: -> arn:aws:states:::
  private normalizeResolvedArn(arn: string): string {
    // パターン: arn:resolved-XXX::Partition または arn:resolved-XXX:Partition
    return arn.replace(/arn:resolved-[^:]+:+Partition/g, 'arn:aws')
  }

  saveStateMachineDefinition(extraction: StateMachineExtraction, outputPath: string): void {
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(outputPath, JSON.stringify(extraction.definition, null, 2), 'utf-8')
  }

  static loadTemplate(templatePath: string): CloudFormationTemplate {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`)
    }

    const content = fs.readFileSync(templatePath, 'utf-8')
    const ext = path.extname(templatePath).toLowerCase()

    if (ext === '.json') {
      return JSON.parse(content) as CloudFormationTemplate
    } else if (ext === '.yaml' || ext === '.yml') {
      throw new Error(
        'YAML CloudFormation templates are not supported yet. Please use JSON format.',
      )
    } else {
      throw new Error(`Unsupported template format: ${ext}`)
    }
  }

  static findTemplatesInCdkOut(cdkOutDir: string): string[] {
    if (!fs.existsSync(cdkOutDir)) {
      throw new Error(`CDK out directory not found: ${cdkOutDir}`)
    }

    const files = fs.readdirSync(cdkOutDir)
    return files
      .filter((file) => file.endsWith('.template.json'))
      .map((file) => path.join(cdkOutDir, file))
  }

  static findStateMachinesInTemplates(
    templatePaths: string[],
  ): Map<string, StateMachineExtraction[]> {
    const parser = new CloudFormationParser()
    const results = new Map<string, StateMachineExtraction[]>()

    for (const templatePath of templatePaths) {
      try {
        const template = CloudFormationParser.loadTemplate(templatePath)
        const stateMachines = parser.extractStateMachines(template)

        if (stateMachines.length > 0) {
          results.set(templatePath, stateMachines)
        }
      } catch (error) {
        console.warn(`Failed to process template ${templatePath}:`, error)
      }
    }

    return results
  }
}
