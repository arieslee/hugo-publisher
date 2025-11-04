# Gemini 修改日志

此文件记录了由 Gemini 对此项目进行的修改。

---

## 2025-11-04: 添加文章自定义URL (Slug) 功能

**目标:** 允许用户为文章指定一个自定义的URL路径（slug），而不是总是根据标题自动生成。

### 后端 (`app.go`)

- **修改 `SavePost` 和 `UpdatePost` 函数**:
  - 函数签名已更新，增加了一个 `slug` 字符串参数。
  - 现在，如果用户提供了 `slug`，将使用它来生成 `.md` 文件名和 Front Matter 中的 `slug`, `disqus_identifier`, 和 `disqus_url` 字段。
  - 如果 `slug` 参数为空，则保持原有逻辑，根据文章标题生成路径。
- **更新 `PostInfo` 结构体**:
  - 添加了 `Slug` 字段，以便在文章列表中将 slug 信息传递给前端。
- **增强 `parsePostInfo` 函数**:
  - 添加了新逻辑，用于在加载文章时从 Front Matter 中解析 `slug:` 字段。

### 前端 (`frontend/src/App.jsx`)

- **新增UI元素**:
  - 在“标题”输入框下方，增加了一个新的“文章URL (Slug)”文本输入框。
  - 该输入框有70个字符的长度限制，并提供了实时字数提示。
- **状态管理**:
  - 添加了新的 `slug` 状态来管理输入框的值。
  - 更新了 `clearForm` 和 `exitEditMode` 函数，以确保在相应操作后清空 `slug` 输入框。
- **功能集成**:
  - **编辑文章**: 当用户点击编辑现有文章时，如果该文章包含自定义 `slug`，它将被自动填充到新的输入框中。
  - **发布/更新**: 在点击“发布文章”或“更新文章”时，`slug` 状态的值会作为新参数传递给后端的 `SavePost` 或 `UpdatePost` 函数。

---

## 2025-11-04: 添加 `lastmod`, `keywords` 和封面可见性功能

**目标:** 增强 Front Matter 的功能，增加修改日期、关键词和封面可见性选项。

### 后端 (`app.go`)

- **添加 `lastmod` 字段**:
  - `SavePost` 函数现在会自动添加一个 `lastmod` 字段，值为当前的完整时间戳。这有助于 Hugo 正确处理文章的更新日期。
- **添加 `keywords` 字段**:
  - `SavePost` 和 `UpdatePost` 函数现在可以接收一个关键词数组。
  - 如果关键词数组不为空，它将被格式化为一个 YAML 列表并添加到 Front Matter 中。
- **添加封面可见性 (`hiddenInList`)**:
  - `SavePost` 和 `UpdatePost` 函数现在可以接收一个布尔值 `isHiddenInList`。
  - 这个值被用于在 Front Matter 的 `cover` 部分设置 `hiddenInList` 字段，取代了之前的硬编码 `true`。
- **更新解析逻辑**:
  - `parsePostInfo` 函数已更新，现在可以正确解析 `keywords` 列表和 `hiddenInList` 布尔值。
  - `PostInfo` 结构体也已更新以包含这些新字段。

### 前端 (`frontend/src/App.jsx`)

- **新增UI元素**:
  - 在“标签”输入框旁边，增加了一个多行文本域用于输入“关键词”。
  - 在“封面图片”上传控件旁边，增加了一个“在列表中隐藏封面”的复选框。
- **状态管理**:
  - 添加了 `keywords` 和 `isCoverHidden` 两个新的 state。
  - `clearForm` 函数已更新，以重置这些新 state。
- **功能集成**:
  - **编辑文章**: 加载文章进行编辑时，会自动填充关键词和封面可见性复选框。
  - **发布/更新**: 保存或更新文章时，会将关键词和封面可见性的值传递给后端。