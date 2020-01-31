import React from 'react'
import { useSubscription } from 'react-apollo'
import gql from 'graphql-tag'
import { toast } from 'react-toastify'
import ToastContent from '../../common/partials/toast-content.jsx'

const DATASET_DELETED_SUBSCRIPTION = gql`
  subscription datasetDeleted($datasetIds: [ID!]) {
    datasetDeleted(datasetIds: $datasetIds)
  }
`

const useDatasetDeletedSubscription = (datasetIds, cb) => {
  const result = useSubscription(DATASET_DELETED_SUBSCRIPTION, {
    variables: { datasetIds },
    shouldResubscribe: true,
  })
  cb(result)
}

export const datasetDeletedToast = (datasetId, name = datasetId) => {
  toast.success(
    <ToastContent
      title="Dataset Deleted"
      body={`Dataset "${name}" has been removed.`}
    />,
  )
}

export default useDatasetDeletedSubscription
