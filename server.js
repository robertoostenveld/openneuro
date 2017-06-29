/*eslint no-console: ["error", { allow: ["log"] }] */
/* eslint-disable no-unused-vars*/

// dependencies ----------------------------------------------------

import express    from 'express';
import async      from 'async';
import config     from './config';
import routes     from './routes';
import bodyParser from 'body-parser';
import morgan     from 'morgan';
import mongo      from './libs/mongo';
import cron       from 'cron';

//Handlers (need access to AwS Jobs handler to kickoff server side polling)
import awsJobs    from './handlers/awsJobs';

// import events lib to instantiate CRN Emitter
import events      from './libs/events';

// configuration ---------------------------------------------------

mongo.connect();

let app = express();

app.use((req, res, next) => {
    res.set(config.headers);
    res.type('application/json');
    next();
});
app.use(morgan('short'));
app.use(bodyParser.json());

// routing ---------------------------------------------------------

app.use(config.apiPrefix, routes);

// error handling --------------------------------------------------

app.use(function(err, req, res, next) {
    res.header('Content-Type', 'application/json');
    var send = {'error' : ''};
    var http_code = (typeof err.http_code === 'undefined') ? 500 : err.http_code;
    if (typeof err.message !== 'undefined' && err.message !== '') {
        send.error = err.message;
    } else {
        if(err.http_code == 400){
            send.error = 'there was something wrong with that request';
        }else if(err.http_code == 401){
            send.error = 'you are not authorized to do that';
        }else if(err.http_code == 404){
            send.error = 'that resource was not found';
        }else{
            send.error = 'there was a problem';
        }
    }
    res.status(http_code).send(send);
});

// aws polling cron  -------------------------------------

new cron.CronJob('*/10 * * * * *', () => {
    let c = mongo.collections;
    /**
     * queries mongo to find running jobs and runs getJobStatus to check status and update if needed.
     * excluding 'UPLOADING' because jobs in that state have not been submitted to Batch
     * polling occurs on a minute interval
     */
    c.crn.jobs.findAndModify(
    {'analysis.status': {$nin: ['SUCCEEDED', 'FAILED', 'UPLOADING']}},
    {'analysis.statusAge': 1},
    {$set: {'analysis.statusAge': new Date()}},
    {},
    (err, res) => {
        // There might be no jobs to poll
        if (res.ok && res.value) {
            let job = res.value;
            // handling rejected jobs here so we can send notifications for those jobs
            if(job.analysis.status === 'REJECTED') {
                awsJobs.jobComplete(job, job.userId);
            } else {
                awsJobs.getJobStatus(job, job.userId);
            }
        }
    });
}, null, true, 'America/Los_Angeles');

// start server ----------------------------------------------------

app.listen(config.port, () => {
    console.log('Server is listening on port ' + config.port);
});
