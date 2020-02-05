import { RetryLink } from 'apollo-link-retry'
import { Client } from '@elastic/elasticsearch'
import createClient, { datasetGenerator } from 'openneuro-client/src/client'
import indexDatasets from './indexDatasets'
import { indexQuery } from './indexQuery'
import datasetsMapping from './datasets-mapping.json'

/**
 * Indexer entrypoint
 */
export default async function main() {
  const retryLink = new RetryLink({
    delay: {
      initial: 3000,
    },
    attempts: {
      max: 10,
    },
  })
  const apolloClient = await createClient(process.env.GRAPHQL_URI, {
    fetch,
    links: [retryLink],
  })
  const elasticClient = new Client({
    node: process.env.ELASTICSEARCH_CONNECTION,
  })
  await elasticClient.indices.putMapping({
    index: 'datasets',
    body: datasetsMapping,
  })
  const datasets = datasetGenerator(apolloClient, indexQuery)
  await indexDatasets(elasticClient, datasets)
}

main()
