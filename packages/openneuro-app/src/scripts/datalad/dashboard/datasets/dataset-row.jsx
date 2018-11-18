import React from 'react'
import moment from 'moment'
import Statuses from '../../../dataset/dataset.statuses.jsx'
import Metrics from '../../../dataset/dataset.metrics.jsx'
import Uploaded from './uploaded.jsx'
import Summary from '../../fragments/dataset-summary.jsx'
import { Link } from 'react-router-dom'

const DatasetRow = ({ dataset }) => (
  <div className="fade-in  panel panel-default" key={dataset._id}>
    <div className="panel-heading">
      <div className="header clearfix">
        <Link to={'/datasets/' + dataset.id}>
          <h4 className="dataset-name">{dataset.draft.description.Name}</h4>
          <Uploaded uploader={dataset.uploader} created={dataset.created} />
        </Link>
        <div className="metric-container">
          <Metrics dataset={dataset} fromDashboard />
        </div>
        <div className="status-container">
          <Statuses dataset={dataset} minimal={true} />
        </div>
      </div>
      <Summary summary={dataset.draft.summary} minimal={true} />
    </div>
  </div>
)

export default DatasetRow
