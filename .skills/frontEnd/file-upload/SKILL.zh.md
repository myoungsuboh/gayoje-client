---
name: 文件上传与校验 (File Upload & Validation)
description: 用于构建安全且用户友好的文件上传体验的标准。在实现文件选择、校验、多文件上传 UI 时阅读。关键词: file.size, allowedTypes, Progress。
rules:
  - "上传前先在客户端校验大小与扩展名。"
  - "文件选择后立即反馈校验结果。"
  - "多文件上传时在 UI 中明确暴露 Queue、Progress、Status。"
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

# 📎 文件上传与校验

> 用于标准化客户端文件校验与多文件上传 UX 的文档。在构建文件上传功能，或处理大小·扩展名校验、进度显示时阅读。

## 1. 核心原则
- 上传前先在客户端校验大小与扩展名。
- 文件选择后立即反馈校验结果。
- 多文件上传时在 UI 中明确暴露 Queue、Progress、Status。

## 2. 规则

### 2-1. 客户端校验
- **大小限制**: 检查 `file.size` 以防止服务器负载。
- **扩展名限制**: 从 `file.name` 中提取扩展名，确认是否为允许的格式。
- **即时反馈**: 文件选择后立即向用户告知校验结果。

### 2-2. 实现模式
```javascript
const validateFile = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];

  if (file.size > maxSize) return '파일 용량이 너무 큽니다.';
  if (!allowedTypes.includes(file.type)) return '지원하지 않는 파일 형식입니다.';
  
  return null;
};
```

### 2-3. 多文件上传管理
- **Queue**: 在 UI 中暴露上传等待列表。
- **Progress**: 以百分比(%)显示单个文件或整体进度。
- **Status**: 明确区分并显示成功/失败。

## 3. 常见错误
- ❌ **仅信任客户端校验** → 必须在服务器重新校验(MIME·大小·魔数)。客户端校验只是 UX 辅助，很容易被绕过。
- ❌ 仅凭扩展名(`file.name`)判断类型 → 可被伪造。用实际内容(魔数/`Content-Type`)确认。
- ❌ 原样保存原始文件名 → 路径 traversal·覆盖·编码问题。用服务器生成的标识符(UUID 等)保存。
- ❌ 用同步上传传输大文件 → 超时·UI 卡死。使用分段/分块 + 异步队列。
- ❌ 不显示进度·失败状态 → 用户无法知道是否卡住/失败。暴露 Queue、Progress、Status。
- ❌ 不做图像重新编码·EXIF 移除就信任 → 恶意载荷·位置信息(EXIF)泄露。
- ❌ 仅在客户端设置大小上限 → 在服务器·网关也设置上限以阻止绕过。

## 4. 检查清单
- [ ] 上传前用 `file.size` 校验大小限制
- [ ] 用 `allowedTypes` 仅放行允许的文件格式
- [ ] 文件选择后立即向用户告知校验结果
- [ ] 多文件上传时在 UI 中暴露等待 Queue
- [ ] 以百分比(%)显示单个/整体进度
- [ ] 明确区分并显示每个文件的成功/失败 Status
