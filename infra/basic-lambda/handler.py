import json
import os

def hello(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from HB Lambda via Serverless!",
            "project": os.getenv("PROJECT_NAME"),
            "input": event,
        }),
    }
