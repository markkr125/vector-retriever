# Collection Rename Feature

## Overview
The collection rename feature allows users to modify the display name and description of any non-default collection through an inline editing interface in the Collection Management Modal.

## Implementation

### Backend Components

#### 1. Service Layer (`services/collections-metadata-service.js`)
- **Method**: `renameCollection(collectionId, { displayName, description })`
- **Validation**: 
  - Rejects rename attempts on default collection
  - Returns error for non-existent collections
- **Operations**:
  - Updates collection metadata in `_system_collections` Qdrant collection
  - Updates in-memory cache
  - Returns updated collection object

#### 2. API Route (`routes/collections.js`)
- **Endpoint**: `PATCH /collections/:collectionId`
- **Request Body**:
  ```json
  {
    "displayName": "New Collection Name",
    "description": "Optional description"
  }
  ```
- **Validation**:
  - Name format: Alphanumeric with spaces, underscores, hyphens only
  - Length: Max 50 characters
  - Uniqueness: Prevents duplicate collection names
  - Default protection: Cannot rename default collection
- **Response**: Updated collection object or error message

### Frontend Components

#### 1. API Client (`web-ui/src/api.js`)
- **Function**: `renameCollection(collectionId, { displayName, description })`
- **Method**: PATCH request to `/api/collections/:collectionId`
- **Error Handling**: Throws axios error with server response

#### 2. Collection Management Modal (`web-ui/src/components/CollectionManagementModal.vue`)

**State Variables:**
- `editingCollection` - ID of collection currently being edited
- `editName` - Temporary storage for edited name
- `editDescription` - Temporary storage for edited description
- `renaming` - ID of collection being saved (loading state)
- `renameError` - Error message to display

**Methods:**
- `startRename(collection)` - Enters edit mode, populates form with current values
- `saveRename(collection)` - Validates and saves changes, reloads collection list
- `cancelRename()` - Exits edit mode without saving

**UI Features:**
- Inline editing: Collection card transforms into edit form
- Visual feedback: Purple border and background during edit
- Action buttons:
  - **View mode**: "✏️ Rename" button (only for non-default collections)
  - **Edit mode**: "✅ Save" and "❌ Cancel" buttons
- Keyboard shortcuts:
  - Enter: Save changes
  - Esc: Cancel editing
- Loading state: "⏳ Saving..." during API call
- Error display: Shows validation errors inline

## Usage Flow

1. **Open Collection Management Modal**
   - Click "Manage Collections" button in header

2. **Start Rename**
   - Click "✏️ Rename" button on any non-default collection
   - Collection card transforms into edit form with pre-filled values

3. **Edit Values**
   - Modify display name and/or description
   - Name validation happens on save

4. **Save Changes**
   - Click "✅ Save" or press Enter
   - Backend validates name format and uniqueness
   - Success: Collection list refreshes, exits edit mode
   - Error: Displays inline error message, stays in edit mode

5. **Cancel Editing**
   - Click "❌ Cancel" or press Esc
   - Discards changes, exits edit mode

## Validation Rules

### Name Format
- Characters: Letters, numbers, spaces, underscores, hyphens
- Regex: `/^[a-zA-Z0-9\s_-]+$/`
- Length: 1-50 characters
- Required: Cannot be empty

### Constraints
- **Uniqueness**: No two collections can have the same display name (case-sensitive)
- **Default Protection**: Cannot rename the default collection
- **Existence**: Collection must exist in the system

### Error Messages
- Invalid format: "Collection name must contain only letters, numbers, spaces, underscores, and hyphens"
- Too long: "Collection name must be 50 characters or less"
- Empty: "Collection name is required"
- Duplicate: "A collection with this name already exists"
- Default: "Cannot rename the default collection"

## Visual Design

### Edit Mode Styling
- **Border Color**: Purple (`#9b59b6`)
- **Background**: Light purple (`#f4ecf7`)
- **Input Focus**: Purple border on focused field

### Button Colors
- **Rename**: Purple background (`#9b59b6`)
- **Save**: Green background (`#27ae60`)
- **Cancel**: Gray background (`#95a5a6`)

### Form Layout
- Vertical layout with labeled fields
- Name field on top, description below
- Error message displays below fields
- Action buttons aligned to right

## Events

The component emits a `collection-renamed` event when a collection is successfully renamed:
```javascript
emit('collection-renamed', collectionId);
```

Parent components can listen for this event to trigger refresh actions (e.g., update collection selector dropdown).

## Technical Notes

### State Management
- Edit state is component-local (not persisted)
- Closing modal or switching collections cancels any in-progress edit
- Only one collection can be edited at a time

### API Integration
- Uses existing Qdrant metadata storage in `_system_collections`
- No changes to document storage or vector data
- Cache updates ensure immediate consistency
- Collection list automatically refreshes after successful rename

### Error Handling
- Server-side validation errors displayed inline
- Network errors handled gracefully
- Loading state prevents double-submission
- Cancel button remains enabled during save