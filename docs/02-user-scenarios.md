# User Scenarios — Given / When / Then

## S1: Create a New Note

**Given** the user is on the main screen  
**When** they click "New Note" or press Ctrl+N  
**Then** a new untitled note is created in IndexedDB, the editor opens with an empty document, the title input is focused and selected, and the file list updates to show the new note at the top

## S2: Edit and Auto-Save

**Given** a note is open in the editor  
**When** the user types or modifies content  
**Then** after a 2-second debounce, the note is auto-saved to IndexedDB, the sync badge updates to "pending", and the preview pane re-renders after 300ms

## S3: Search Notes by Tag

**Given** the user has multiple notes with tags  
**When** they type `tag:meeting` in the search bar  
**Then** only notes tagged "meeting" are displayed in the file list, the count updates, and clearing the search restores the full list

## S4: Search Notes by Date

**Given** the user has notes created on various dates  
**When** they type `date:2026-04` in the search bar  
**Then** only notes modified in April 2026 are shown, supporting partial date prefix matching

## S5: Switch Visual Theme

**Given** the user is in Settings  
**When** they select "Nord" from the theme dropdown  
**Then** all CSS custom properties update instantly, the editor and preview retheme without reload, and the preference is saved to IndexedDB for next session

## S6: Insert a Mermaid Diagram via Snippet

**Given** a note is open in edit mode  
**When** the user types `/flowchart` and selects the snippet from the autocomplete menu  
**Then** a fenced mermaid code block with a starter flowchart template is inserted at the cursor, and the preview pane renders the diagram as SVG

## S7: Use Formatting Toolbar

**Given** text is selected in the editor  
**When** the user clicks the Bold button (or Ctrl+B)  
**Then** the selected text is wrapped with `**...**` markers and the preview updates to show bold text

## S8: Toggle Pin / Favorite

**Given** a note is open  
**When** the user clicks the pin/star button  
**Then** the note's pinned state toggles, the sidebar "Favorites" count updates, and the file list reflects the new star icon

## S9: Work Offline

**Given** the user loses network connectivity  
**When** they continue editing notes  
**Then** all changes save to IndexedDB, the status bar shows "Offline — Changes saved locally" with an offline indicator, and when connectivity returns the status updates to "Online — Ready"

## S10: Render LaTeX Math

**Given** a note contains `$E = mc^2$` inline or `$$\int_0^\infty e^{-x} dx = 1$$` as a block  
**When** the preview pane renders  
**Then** KaTeX renders the math expressions as properly typeset formulas

## S11: Navigate via Wiki-Links

**Given** a note contains `[[Project Alpha]]`  
**When** the user clicks the rendered wiki-link in preview  
**Then** the app searches for a note titled "Project Alpha" and opens it, or offers to create it if not found

## S12: Use the Tips Bar

**Given** the app has loaded  
**When** the tips bar is visible  
**Then** a rotating tip displays every 30 seconds, the collapse button hides the bar, and "All tips" opens a full directory of tips by category

## S13: Insert Quick Snippet

**Given** the editor is focused  
**When** the user types `/standup`  
**Then** the autocomplete menu shows the "Daily Standup" snippet from the Meeting category, and selecting it inserts the full template with `{{date}}` replaced by today's date

## S14: Run an AI Prompt on Selection

**Given** a paragraph is selected in the editor and an LLM provider is configured  
**When** the user opens the AI panel and selects "Summarize"  
**Then** the selected text is sent to the LLM with the summarize prompt template, the response streams token-by-token into the AI panel, and the user can insert the result at cursor or replace the selection

## S15: Upload and Extract PDF

**Given** the user drags a PDF file onto the editor  
**When** the file is dropped  
**Then** PDF.js extracts the text content, a progress bar shows extraction progress, and the extracted text is inserted into a new note with the PDF filename as the title

## S16: Sync to Google Drive

**Given** the user has authenticated with Google Drive  
**When** they create or edit a note  
**Then** the sync engine queues the change, uploads the `.md` file to the app's Drive folder on next sync cycle, and the sync badge changes from "pending" to "synced"

## S17: Use In-Browser LLM

**Given** the user has downloaded a local model (e.g., Phi-3-mini)  
**When** they run a prompt without an internet connection  
**Then** WebLLM performs inference entirely in the browser via WebGPU/WASM, tokens stream into the response area, and no data leaves the device

## S18: Export and Backup All Notes

**Given** the user wants to backup their notes  
**When** they click "Export All" in Settings  
**Then** a ZIP file is generated containing all notes as `.md` files, all attachments, and a `metadata.json` manifest, and is downloaded to the user's device
