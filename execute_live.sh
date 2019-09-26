#!/bin/bash
export GOOGLE_APPLICATION_CREDENTIALS=src/config/gcloud-auth.json 
node src/regenerate.js --ini=2019-06-06T00:00:00.000Z --end=2019-06-11T00:00:00.000Z --env=live --by=d