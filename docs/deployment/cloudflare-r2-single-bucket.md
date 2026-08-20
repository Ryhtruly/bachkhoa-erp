# Cloudflare R2: one private ERP bucket

Create exactly one private R2 bucket: `bachkhoa-erp-files`.

Configure the backend with the R2 S3 endpoint and credentials, then set:

```dotenv
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_CREATE_BUCKETS=false
OBJECT_STORAGE_ALLOW_PUBLIC_BUCKETS=false
OBJECT_STORAGE_BUCKET=bachkhoa-erp-files
```

The application writes object keys under these prefixes:

```text
wiki/<document-id>/<filename>
finance/payment-receipts/<period>/<batch>/<receipt>
contract-templates/<template-code>/v<version>.docx
contracts/<contract-id>/service-lines/<service-line-id>/nodes/<task-node-id>/<filename>
avatars/<employee-id>_<random>_<filename>
```

Keep the bucket private. Wiki, avatar, and workflow-evidence reads are streamed
by authenticated ERP endpoints; finance and contract-template reads stay
backend-only. The database stores only the object keys above, never permanent
R2/public URLs. Before production cutover, upload the initial contract
template, verify a Wiki download, an avatar and workflow-evidence read, a
finance receipt read, and a contract document render using accounts with the
corresponding ERP permissions.
