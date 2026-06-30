---
name: File Upload & Validation (File Upload & Validation)
description: A standard for building a safe and user-friendly file upload experience. Read when implementing file selection, validation, and multi-upload UI. Keywords: file.size, allowedTypes, Progress.
rules:
  - "Validate size and extension on the client first, before uploading."
  - "Give immediate validation feedback right after file selection."
  - "For multi-upload, clearly expose Queue, Progress, and Status in the UI."
tags:
  - "file.size"
  - "확장자 제한"
  - "allowedTypes"
  - "업로드 Queue"
  - "Progress"
  - "FileReader"
  - "FormData"
  - "multipart"
  - "input type=\'file\'"
  - "accept="
  - "createObjectURL"
  - "drag-and-drop"
---

# 📎 File Upload & Validation

> A document for standardizing client-side file validation and multi-upload UX. Read when building file upload features or handling size/extension validation and progress display.

## 1. Core Principles
- Validate size and extension on the client first, before uploading.
- Give immediate validation feedback right after file selection.
- For multi-upload, clearly expose Queue, Progress, and Status in the UI.

## 2. Rules

### 2-1. Client-side Validation
- **Size limit**: check `file.size` to prevent server load.
- **Extension limit**: extract the extension from `file.name` and verify it is an allowed format.
- **Immediate feedback**: inform the user of the validation result right after file selection.

### 2-2. Implementation Pattern
```javascript
const validateFile = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];

  if (file.size > maxSize) return '파일 용량이 너무 큽니다.';
  if (!allowedTypes.includes(file.type)) return '지원하지 않는 파일 형식입니다.';
  
  return null;
};
```

### 2-3. Managing Multi-file Uploads
- **Queue**: expose the upload waiting list in the UI.
- **Progress**: show per-file or overall progress as a percentage (%).
- **Status**: clearly distinguish and display success/failure.

## 3. Common Mistakes
- ❌ **Trusting client validation only** → always re-validate on the server (MIME, size, magic number). Client validation is only a UX aid and is easily bypassed.
- ❌ Judging type by extension (`file.name`) alone → can be forged. Verify with actual content (magic number/`Content-Type`).
- ❌ Storing the original filename as-is → path traversal, overwrite, and encoding problems. Store with a server-generated identifier (UUID, etc.).
- ❌ Sending large data via synchronous upload → timeout and UI freeze. Use multipart/chunked + async queue.
- ❌ Not showing progress/failure status → the user cannot know it is stuck/failed. Expose Queue, Progress, Status.
- ❌ Trusting images without re-encoding/EXIF removal → malicious payloads and location info (EXIF) leakage.
- ❌ Keeping the size limit only on the client → set the limit on the server/gateway too to block bypass.

## 4. Checklist
- [ ] Validate the size limit with `file.size` before uploading
- [ ] Pass only allowed file formats through `allowedTypes`
- [ ] Inform the user of the validation result immediately after file selection
- [ ] Expose the waiting Queue in the UI for multi-upload
- [ ] Show per-file/overall progress as a percentage (%)
- [ ] Clearly distinguish and display each file's success/failure Status
