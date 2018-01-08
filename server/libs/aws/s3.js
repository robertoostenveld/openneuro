/*eslint no-console: ["error", { allow: ["log"] }] */

import fs from 'fs'
import files from '../files'
import config from '../../config'
import async from 'async'

const Bucket = config.aws.s3.datasetBucket

export default aws => {
  const s3 = new aws.S3({
    httpOptions: {
      timeout: config.aws.s3.timeout,
    },
  })

  return {
    sdk: s3,

    /**
         * Queue
         *
         * A queue to limit s3 request concurrency. To use
         * call queue.push(request) with a request object with
         * the following properties.
         * function: the function to be called
         * arguments: an array of arguments applied to the function
         * callback: a callback function
         */
    fileQueue: async.queue((task, callback) => {
      task.uploadFunction(task.filePath, task.remotePath, callback)
    }, config.aws.s3.concurrency),

    uploadFile(filePath, remotePath, callback) {
      const data = fs.createReadStream(filePath)
      const contentType = files.getContentType(filePath)

      const upload = new aws.S3.ManagedUpload({
        params: {
          ACL: 'private',
          Bucket,
          Key: remotePath,
          Body: data,
          ContentType: contentType,
        },
      })

      upload.send(err => {
        if (err) {
          return callback(err)
        } else {
          callback()
        }
      })
    },

    createBucket(bucketName, callback) {
      s3.createBucket({ Bucket: bucketName }, function(err, res) {
        callback(err, res)
      })
    },

    /**
         * Upload Snapshot
         *
         * Takes the hash of a locally saved snapshot and uploads it
         * to S3. Callsback immediately if the dataset already exists
         * on S3 or when the upload is complete.
         */
    uploadSnapshot(snapshotHash, callback) {
      s3.getObjectTagging(
        {
          Bucket,
          Key: snapshotHash + '/dataset_description.json',
        },
        (err, data) => {
          // check if snapshot is already complete on s3
          let snapshotExists = false
          if (data && data.TagSet) {
            for (let tag of data.TagSet) {
              if (tag.Key === 'DatasetComplete' && tag.Value === 'true')
                snapshotExists = true
            }
          }

          if (snapshotExists) {
            callback()
          } else {
            let dirPath =
              config.location + '/persistent/datasets/' + snapshotHash

            // loop through each file in the directory
            files.getFiles(dirPath, files => {
              // loop through each file and add them to the file queue.
              // fileQueue uploads via async.queue(), and limits concurrent uploads.
              async.each(
                files,
                (filePath, cb) => {
                  let remotePath = filePath.slice(
                    (config.location + '/persistent/datasets/').length,
                  )

                  // push file to the fileQueue
                  this.fileQueue.push(
                    {
                      uploadFunction: this.uploadFile,
                      filePath: filePath,
                      remotePath: remotePath,
                    },
                    err => {
                      if (err) {
                        return cb(err)
                      }
                    },
                  )
                },
                err => {
                  if (err) {
                    callback(err)
                  } else {
                    // tag upload as complete
                    s3.putObjectTagging(
                      {
                        Bucket,
                        Key: snapshotHash + '/dataset_description.json',
                        Tagging: {
                          TagSet: [
                            {
                              Key: 'DatasetComplete',
                              Value: 'true',
                            },
                          ],
                        },
                      },
                      () => {
                        callback()
                      },
                    )
                  }
                },
              )
            })
          }
        },
      )
    },
    /**
         * Get Results for a job
         *
         * Takes a params object which defines output bucket location for a job
         * returns results formatted to be compatible with filetree component on client
         */
    getJobResults(params, callback) {
      this.getAllS3Objects(params, [], (err, results) => {
        if (err) {
          return callback(err)
        }

        //Need to format results to preserver folder structure. this could use some cleanup but works for now
        let formattedResults = []
        let resultStore = {}

        let nestResultsByPath = (array, store) => {
          let parent = store[array[0]]
          let path = parent.dirPath

          let checkChildren = (childrenArray, path) => {
            return childrenArray.find(child => {
              return child.dirPath === path
            })
          }

          array.forEach((level, k) => {
            //right now setting up top level before passing in store. can probably change this
            if (k === 0) {
              parent._id = k
              parent.name = level
              return
            }

            path = path + level + (k === array.length - 1 ? '' : '/') //last element in array is the filename

            let child = checkChildren(parent.children, path)
            if (child) {
              parent = child
            } else {
              child = {
                dirPath: path,
                children: [],
                type: 'folder',
                parentId: k - 1,
                name: level,
                _id: k,
              }
              if (k === array.length - 1) {
                delete child.children
                child.type = 'file'
                child.path = params.Bucket + '/' + params.Prefix + path
              }
              parent.children.push(child)
              parent = child
            }
          })

          return store
        }

        results.forEach(result => {
          let pathArray = result.path.split('/').slice(3)
          if (pathArray.length === 1) {
            resultStore[pathArray[0]] = {
              type: 'file',
              dirPath: pathArray[0],
              name: pathArray[0],
              path: result.path,
            }
          } else {
            if (!resultStore[pathArray[0]]) {
              resultStore[pathArray[0]] = {
                type: 'folder',
                children: [],
                name: pathArray[0],
                dirPath: pathArray[0] + '/',
              }
            }
            nestResultsByPath(pathArray, resultStore)
          }
        })

        Object.keys(resultStore).forEach(result => {
          formattedResults.push(resultStore[result])
        })

        callback(null, formattedResults)
      })
    },

    getAllS3Objects(params, results, callback) {
      s3.listObjectsV2(params, (err, data) => {
        data.Contents.forEach(obj => {
          if (!/\/$/.test(obj.Key)) {
            let result = {}
            result.name = obj.Key
            result.path = params.Bucket + '/' + obj.Key
            results.push(result)
          }
        })
        if (data.IsTruncated) {
          // Append more results from the next call
          params.ContinuationToken = data.NextContinuationToken
          this.getAllS3Objects(params, results, callback)
        } else {
          callback(err, results)
        }
      })
    },
  }
}
