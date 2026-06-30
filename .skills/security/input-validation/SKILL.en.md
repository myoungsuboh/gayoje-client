---
name: Input Validation & Data Sanitization (Security)
description: A foundational, general-purpose security standard that validates and sanitizes untrusted input on the server side to prevent Injection, XSS, and Path Traversal, covering whitelisting, context-specific escaping/parameterization, HTML sanitization, and multi-layer file-upload validation (stack-agnostic). Read it when building input-receiving APIs, forms, or file uploads, or when fixing sanitization/escaping logic. Keywords: sanitize, whitelist, escape, parameterize, injection, XSS, path traversal, file upload.
rules:
  - "Common foundation (summary): do not trust input, enforce on the server side, express constraints as a declarative schema, and reject on failure (fail-closed). — for details, see validation-bean."
  - "Whitelist first: explicitly define the 'values to allow' and reject the rest. A blacklist that only picks out 'dangerous values' cannot block new bypass patterns."
  - "Handle per context (escape/parameterize): defense differs by where the input is used. Parameterize queries (no string concatenation), encode/escape HTML output, and neutralize shells and file paths with that context's rules. 'It was validated, so use it as-is' is dangerous."
  - "Sanitize risky output: if you must allow markup such as HTML, let only allowed tags/attributes through with a vetted sanitization tool. Do not try to filter tags with your own regex."
  - "Validate file uploads in multiple layers: validate the extension, MIME type, actual content (magic bytes), and size, and do not store uploaded files in a location served/executed directly from the web (the web root)."
  - "Block Path Traversal: when joining input to a file path/name, normalize it and then confirm it is inside the allowed directory."
tags:
  - "sanitize"
  - "whitelist"
  - "escape"
  - "parameterize"
  - "injection"
  - "XSS"
  - "path traversal"
  - "file upload"
  - "validate"
  - "schema"
  - "pydantic"
  - "zod"
  - "DOMPurify"
  - "bleach"
foundational: true
---

# 🛡️ Input Validation & Data Sanitization (Security)

> Validate and sanitize all untrusted input on the server side to block attacks such as Injection, XSS, and Path Traversal. Read it when building input-receiving APIs, forms, or file uploads, or when fixing validation/sanitization logic. It is a general-purpose security standard that is not tied to a specific language/library.
>
> This skill is the **security perspective** (attack defense). For the general design of input model validation and the error-response standard, also see `validation-bean` (input validation standard). For the full catalog of attacks such as output encoding and SQL Injection, refer to `owasp-top10`.

## 1. Core Principles

The common foundation of validation (distrust input, server-side enforcement, declarative schema, fail-closed) is noted in one line only; below focuses on **security-specific defense**. For the general design of validation and error responses, see `validation-bean` (input validation standard).

- **Common foundation (summary)**: do not trust input, enforce on the server side, express constraints as a declarative schema, and reject on failure (fail-closed). — for details, see `validation-bean`.
- **Whitelist first**: explicitly define the "values to allow" and reject the rest. A blacklist that only picks out "dangerous values" cannot block new bypass patterns.
- **Handle per context (escape/parameterize)**: defense differs by where the input is used. **Parameterize** queries (no string concatenation), **encode/escape** HTML output, and neutralize shells and file paths with that context's rules. "It was validated, so use it as-is" is dangerous.
- **Sanitize risky output**: if you must allow markup such as HTML, let **only allowed tags/attributes** through with a vetted sanitization tool. Do not try to filter tags with your own regex.
- **Validate file uploads in multiple layers**: validate the extension, MIME type, actual content (magic bytes), and size, and do not store uploaded files in a location served/executed directly from the web (the web root).
- **Block Path Traversal**: when joining input to a file path/name, normalize it and then confirm it is inside the allowed directory.

```
Validate on the server (required)      > Validate on the client (optional UX)
Whitelist (allow list)                 > Blacklist (block list)
Declarative schema                     > Hand-written regex
Parameterize / escape                  > Concatenate input strings directly
Magic bytes (actual content)           > Trust extension/MIME only
```

## 2. Rules

> The general rules of entry-point bulk validation, server-side enforcement, and declarative schemas follow `validation-bean`. For security, do not scatter format/enum/length validation across handlers with hand-written regex and `if`; gather it in a declarative schema (to prevent omission and bypass). Below contains only security-specific rules.

### 2-1. Specify allowed values with a whitelist
- Define the allowed format/enum values/range and reject the rest. Do not rely on a blacklist that picks out dangerous strings to block.
- Enforce enumerated values (role, status, sort key, etc.) with an allow list, so arbitrary values do not leak into logic or queries.

```text
// ❌ Forbidden — block only "things that look dangerous" with a blacklist (bypassable)
if input contains "<script>" or "DROP TABLE": reject

// ✅ Recommended — only the allow list passes
role ∈ { "user", "admin" }          // reject everything else
sortKey ∈ { "createdAt", "name" }   // block arbitrary column names
```

### 2-2. Parameterize/escape to match the output context
- Handle DB queries with **parameterization/binding** and do not concatenate input as a string (SQL Injection defense).
- For values output as HTML, **encode/escape** to match the output context (XSS defense).
- When putting input into shell commands or file paths, neutralize it with that context's rules, and for paths, normalize and then confirm it is inside the allowed directory (Path Traversal defense).

```text
// ❌ Forbidden — concatenate input as-is (Injection)
query("SELECT * FROM users WHERE id = " + input.id)
render("<div>" + input.comment + "</div>")
open(baseDir + "/" + input.filename)        // can escape with "../"

// ✅ Recommended — parameterize · escape · check after path normalization
query("SELECT * FROM users WHERE id = ?", [input.id])
render(escapeHtml(input.comment))
path = normalize(baseDir + "/" + input.filename)
assert path startsWith baseDir              // reject if outside the allowed directory
```

### 2-3. Sanitize risky output (HTML, etc.) with a vetted tool
- If you must allow HTML input, let **only allowed tags/attributes** through with a vetted sanitization tool and remove the rest.
- Do not try to filter `<script>` and the like with your own regex — it is bypassed via encoding, nesting, event handlers, etc.

```text
// ❌ Forbidden — strip tags with your own regex (bypassable)
stripTags(userHtml)

// ✅ Recommended — let only allowed tags/attributes through with a vetted sanitizer
allowTags  = { b, i, em, strong, a, p, br }
allowAttrs = { a: [href, title] }
clean = sanitize(userHtml, allowTags, allowAttrs)
```

### 2-4. File uploads: multi-layer validation + safe storage
- Validate the extension/MIME type/size with a whitelist, and confirm even the **actual content (magic bytes)** to block disguised files.
- Do not store uploaded files in the web root (a location executed/served by direct URL), and do not use the file name as-is (use a server-generated name, block path escape).

```text
// ❌ Forbidden — trust by extension only, store in the web root with the original file name
save(file, webroot + "/" + file.name)

// ✅ Recommended — extension + MIME + magic bytes + size, store in a safe location
assert ext  ∈ allowedExts
assert mime ∈ allowedMimes
assert magicBytes(file) matches declaredType    // block disguised files
assert size <= maxSize
save(file, nonWebrootDir + "/" + generatedName) // do not use the original file name
```

## 3. Common Mistakes

> For general traps such as trusting client validation only or missing entry-point validation, refer to `validation-bean`. Below are security-specific traps.

- **Blocking only dangerous values with a blacklist** → cannot block new bypass patterns. Use a whitelist.
- **Assuming "validated, so safe" and using it as-is** → validation and output handling are separate. Parameterize queries, escape HTML.
- **Removing HTML/scripts with your own regex** → XSS bypass via encoding/nesting. Use a vetted sanitizer.
- **Trusting files by extension/MIME only** → a disguised file may be executed. Confirm even the magic bytes.
- **Storing uploaded files in the web root with the original name** → an uploaded script may execute or path escape may occur.
- **Joining input to a path/file name as-is** → escapes the directory with `../`. Check the allowed range after normalization.
- **Exposing internal information in error responses** → do not emit stack traces/implementation details as-is (refer to `validation-bean`).

## 4. Checklist

> For general items such as server-side validation and declarative schemas, use the `validation-bean` checklist. Below are security-specific items.

- [ ] Is format/enum/range enforced with a **whitelist (allow list)** approach (no reliance on hand-written regex)?
- [ ] Are DB queries **parameterized/bound**, with input not concatenated as a string (SQL Injection)?
- [ ] Are HTML output values **escaped/encoded** to match the output context (XSS)?
- [ ] Is input that goes into a file path/name checked to be **inside the allowed range** after normalization (Path Traversal)?
- [ ] Is HTML input let through only with allowed tags/attributes by a **vetted sanitizer**?
- [ ] Are the extension, MIME, **magic bytes**, and size of file uploads all validated?
- [ ] Are uploaded files stored **outside the web root** with a server-generated name?
- [ ] Is validation failure a **rejection (fail-closed)**, with no internal information exposed in the response?

## Appendix: Examples by Stack

> The following are reference implementation examples. Add them in the same pattern to match the stack your team uses. The principles and rules in 1–4 above are the standard; the appendix is just an application of them.

### Python (Pydantic) — declarative schema validation

```python
# ✅ Recommended — enforce structure, type, and range with a declarative schema
from pydantic import BaseModel, EmailStr, constr, validator

class CreateUserRequest(BaseModel):
    name: constr(min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(ge=0, le=150)
    role: Literal["user", "admin"]  # whitelist enforcement

    @validator("name")
    def name_no_html(cls, v):
        if "<" in v or ">" in v:
            raise ValueError("이름에 HTML 태그를 사용할 수 없습니다.")
        return v
```

### TypeScript/JavaScript (Zod) — declarative schema validation

```typescript
// ✅ Recommended — validate with safeParse and respond 400 on failure
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});

const result = createUserSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.flatten() });
}
```

### Python — file upload security

Validate the extension, MIME type, and size, and confirm the actual format with magic bytes.

```python
# ✅ Recommended — validate extension, MIME, and size all with a whitelist
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_upload(file):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("허용되지 않는 파일 형식입니다.")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("MIME 타입이 올바르지 않습니다.")
    if file.size > MAX_FILE_SIZE:
        raise ValueError("파일 크기는 10MB 이하여야 합니다.")
    # Confirming the actual format with magic bytes is also recommended (python-magic library)
```

### Python (bleach) — HTML sanitization

```python
# ❌ Forbidden — attempting to filter tags with your own regex (bypassable)
# ✅ Recommended — let only allowed tags/attributes through with a vetted library (bleach)
import bleach

ALLOWED_TAGS = ["b", "i", "em", "strong", "a", "p", "br"]
ALLOWED_ATTRS = {"a": ["href", "title"]}

clean_html = bleach.clean(user_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS)
```

> If you need to sanitize HTML before rendering it on the frontend (browser), use a vetted library such as DOMPurify.
