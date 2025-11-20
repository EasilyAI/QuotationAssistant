import boto3
import json

def start_job(bucket, document, features=['TABLES'], region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.start_document_analysis(
        DocumentLocation={'S3Object': {'Bucket': bucket, 'Name': document}},
        FeatureTypes=features
    )
    job_id = response['JobId']
    print(f"Started job with JobId: {job_id}")
    return job_id

def is_job_complete(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.get_document_analysis(JobId=job_id)
    status = response['JobStatus']
    print(f"Job status: {status}")
    return status

def get_job_results(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    pages = []
    next_token = None

    while True:
        if next_token:
            response = client.get_document_analysis(JobId=job_id, NextToken=next_token)
        else:
            response = client.get_document_analysis(JobId=job_id)
        pages.append(response)
        print(f"Retrieved {len(response.get('Blocks', []))} blocks on this page.")
        next_token = response.get('NextToken')
        if not next_token:
            break
        print("Fetching next page of results...")
    return pages

def save_results_to_file(pages, out_filename='textract_output.json'):
    # if you want to save full list of pages into one file:
    with open(out_filename, 'w', encoding='utf-8') as f:
        json.dump(pages, f, indent=2)
    print(f"Saved results to {out_filename}")