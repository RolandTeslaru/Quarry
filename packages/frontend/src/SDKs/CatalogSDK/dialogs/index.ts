import { openCreateDatasetFromFileDialog, openUploadToDatasetDialog } from './dataset-dialogs'

export function _createCatalogDialogs_() {
    return {
        openCreateDatasetFromFile: openCreateDatasetFromFileDialog,
        openUploadToDataset:       openUploadToDatasetDialog,
    }
}

export type _CatalogSDKDialogs = ReturnType<typeof _createCatalogDialogs_>
