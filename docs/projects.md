# Projects plugin

Install Projects from Plugins. The sidebar then includes Projects. Create a project, add shared instructions and files, and start separate conversations inside that workspace. Projects does not require Chat History; the latter continues to manage ordinary AI Chat independently.

Project instructions and relevant shared-file text excerpts are included when generating a reply with an installed local model. Each conversation has its own transcript; other project chats are not automatically merged into the prompt. You can search project conversations, rename them, delete them, edit prompts, regenerate responses, and clear a conversation through the existing chat controls.

Project files, instructions and chats are stored under the existing application profile's `projects/<project-id>/` directory. Original selected files are copied into that directory; deleting a shared copy does not delete the original. Data is outside the app installation, so replacing/updating the app leaves projects in place. Directory/file permissions are owner-only on platforms supporting Unix permissions. Projects has no hosted storage, embeddings API or external inference dependency.

A project supports 20 files, 12 MB per file, and PDF, Word (.docx), Markdown and the text/code formats supported by chat attachments. Text extraction currently saves up to 32,000 characters per file. Long files are marked as excerpts in the UI. Retrieval selects text chunks relevant to the current request and fits excerpts within the model context budget. Scanned PDFs without selectable text require OCR before import. Instructions support 12,000 characters, but the selected model's context budget may require shorter instructions. Projects support 200 chats, with up to 100 recent messages saved per chat.

Validation includes local store persistence, independent project contexts, chat/file removal, permissions, input guards, serialized updates, a full Electron UI flow, ordinary Chat History regression checks, and real local Gemma inference using a shared file and project instructions.
