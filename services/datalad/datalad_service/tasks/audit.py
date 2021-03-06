import json
import os
import subprocess
import random

from datalad_service.common.celery import dataset_task, dataset_queue
from datalad_service.common.raven import client


@dataset_task
def audit_datasets(store):
    dataset_dirs = os.listdir(store.annex_path)
    dataset = random.choice(dataset_dirs)
    # Randomize start time a bit to reduce risk of stampedes
    countdown = random.randint(1, 30)
    audit_remotes.apply_async(
        (store.annex_path, dataset), queue=dataset_queue(dataset), countdown=countdown)


def fsck_remote(ds, remote):
    """Run fsck for one dataset remote"""
    # Run at most once per month per dataset
    annex_command = ("git-annex", "fsck", "--all", "--from={}".format(remote), "--fast", "--json",
                     "--json-error-messages", "--incremental", "--incremental-schedule=30d", "--time-limit=15m")
    annex_process = subprocess.Popen(
        annex_command, cwd=ds.path, stdout=subprocess.PIPE, encoding='utf-8')
    bad_files = []
    for annexed_file_json in annex_process.stdout:
        annexed_file = json.loads(annexed_file_json)
        if not annexed_file.success:
            # Oops, log it!
            bad_files.append(annexed_file)
    if len(bad_files) > 0:
        client.context.merge(
            {'dataset': ds.path, 'remote': remote, bad_files: bad_files})
        client.captureMessage(
            'Remote audit failed! Some expected annex keys were unavailable at this remote.')
        client.context.clear()


@dataset_task
def audit_remotes(store, dataset):
    """
    Iterate over all defined S3 special remotes and run git-annex fsck.

    This is memoized by the git-annex incremental option to reduce duplicate calls.

    Audits run on the publish worker for now. This introduces some delay publishing 
    but prevents deadlocks of the main dataset workers.
    """
    ds = store.get_dataset(dataset)
    ds.siblings()
    for sib in ds.siblings():
        # Only check S3 remotes for now
        if sib['name'].startswith('s3-'):
            fsck_remote(ds, sib['name'])
