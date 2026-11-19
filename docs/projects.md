# Projects plugin

Install Projects from Plugins. In AI Chat, Projects appears above Chat history in the chat sidebar. Use the small plus beside Projects to create a project with a name and a source folder chosen through the native folder picker. There is no separate Projects page or main navigation item.

Click a folder row to expand or collapse its chats. Hover or focus a row to reveal its new-chat plus and settings menu. Each project has independent conversations; ordinary chats remain under Chat history. Search filters chat titles. Project settings retain shared instructions without leaving the chat screen.

New projects store instructions and chats in `<chosen-folder>/.powerbrix/projects/<project-id>.json`. The private application profile contains a locator for each folder-backed project. Existing projects made before folder selection remain readable. Replacing/updating the app preserves project data.

Before each project reply, the app scans supported source documents recursively, reuses extracted text only when the file's modification/change times and size match, and selects excerpts relevant to the question. Added, edited and deleted files are reflected on subsequent requests. Files stay in the selected folder. Hidden files, symlinks, dependency folders and common build directories are excluded. Supported files include PDF, Word (.docx), Markdown and the same text/code formats as attachments. There is no external indexing or inference API.

Per-file limits are 12 MB and 2,000,000 extracted characters. The model receives relevant excerpts within its context budget, not the entire folder in every prompt. Unreadable files are identified to the model so it can explain missing material. Large directory scans stop with a clear error rather than silently claiming a complete scan. Scanned PDFs need OCR to provide readable text. Project instructions support 12,000 characters, but the chosen model's context window may require shorter instructions.

Each project supports 200 chats with up to 100 recent messages saved per conversation. Other project chats are not automatically merged into a prompt. Removing a project deletes its own PowerBrix state, not documents in the source folder.

Validation covers folder-backed storage, source-file changes, project isolation, permissions, restart persistence, collapsed chat lists, creation and settings dialogs, normal chat regression tests and actual local inference using project instructions and a source document.
