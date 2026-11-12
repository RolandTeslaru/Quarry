import { openCreateDatasetFromFileDialog, openUploadToDatasetDialog } from './dataset-dialogs'
import { openEditSchemaDialog } from './schema-dialogs'

export function _createCatalogDialogs_() {
    return {
        openCreateDatasetFromFile: openCreateDatasetFromFileDialog,
        openUploadToDataset:       openUploadToDatasetDialog,
        openEditSchema:            openEditSchemaDialog,
    }
}

export type _CatalogSDKDialogs = ReturnType<typeof _createCatalogDialogs_>
