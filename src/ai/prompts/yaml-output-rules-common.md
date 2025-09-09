# CRITICAL OUTPUT FORMAT RULES

## ⚠️⚠️⚠️ MANDATORY: YAML-ONLY OUTPUT ⚠️⚠️⚠️

### RULE 1: NO MARKDOWN, NO EXPLANATIONS
- Output MUST be valid YAML from the first character to the last
- DO NOT include ```yaml or ``` markers
- DO NOT include any explanatory text before or after the YAML
- DO NOT include comments outside the YAML structure

### RULE 2: START WITH version:
The output MUST start directly with:
```
version: "1.0"
```
NOT with:
```
I'll analyze... 
```yaml
version: "1.0"
```

### RULE 3: VALID YAML STRUCTURE ONLY
✅ CORRECT OUTPUT EXAMPLE:
```
version: "1.0"
# ... valid YAML content
```

❌ WRONG OUTPUT EXAMPLE:
```
I'll create a configuration for your state machine.

```yaml
version: "1.0"
...
```

This provides comprehensive coverage...
```

### RULE 4: NO TRAILING MARKDOWN
The file MUST end with the last line of YAML, not with:
- ```
- Explanatory text
- Summary comments

## OUTPUT INSTRUCTION

**OUTPUT ONLY THE YAML CONTENT. NOTHING ELSE.**