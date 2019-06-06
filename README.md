# Data Migration From Database to BigQuery

## Configuration

You need to add and configure the following files

- ./config/gcloud-auth.json
  > Get from Google Console, User with access to Store and BigQuery
- ./config/index.js

  > Global Configuration File
  >
  > - data: Each type of element to process
  >   - gCloud.bigQuery
  >     - table: Table to add this type of data to BigQuery
  >     - dateField: Date field for delete actions
  > - environment: Each type of enviroment to support
  >   - gCloud.store.bucketName: Google Store Bucket Name
  >   - gCloud.bigQuery.dataset: Google BigQuery Dataset
  >   - database: Database configuration

- ./config/sql/\*.sql
  > SQL Queries for each type of data

## Use it

The command regenerate have the following parameters

- You need to export your Google Account credential **GOOGLE_APPLICATION_CREDENTIALS**
- **--ini, -i:** Date ini (Mandatory) _(Iso Format: 2019-05-21T00:00:00.000Z)_
- **--end, -e:** Date end (Mandatory) _(Iso Format: 2019-05-21T00:00:00.000Z)_
- **--by:** Calculate By (Optional) _(Time slitter for partial calculation: h, d, m, y. **By default: h**)_
- **--env:** Environment (Optional) _(Configure with environment will take from the config file. **By default: test**)_

### Command samples

Test environment with default values

```bash
export GOOGLE_APPLICATION_CREDENTIALS=src/config/gcloud-auth.json
node src/regenerate.js --ini=2019-06-06T08:00:00.000Z --end=2019-06-06T10:00:00.000Z
```

Live Environment calculated by day

```bash
export GOOGLE_APPLICATION_CREDENTIALS=src/config/gcloud-auth.json
node src/regenerate.js --ini=2019-05-21T00:00:00.000Z --end=2019-05-22T00:00:00.000Z --env=live --by=d
```

## Flow

- Get Data from Database
- Transform in CSV
- Upload to Google Store
- Remove from Google BigQuery
- Move from Google Store to Google BigQuery

## Important

Your BigQuery dataset should have the save fields that your query
