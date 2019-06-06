#!/bin/bash
export GOOGLE_APPLICATION_CREDENTIALS=src/config/gcloud-auth.json 
node src/regenerate.js --ini=2019-06-06T08:00:00.000Z --end=2019-06-06T10:00:00.000Z