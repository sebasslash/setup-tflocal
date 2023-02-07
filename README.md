# setup-tflocal 

## Overview

Trigger runs on TFC workspaces managing a tflocal instance, allowing you to:
- Fetch credentials from the instance and make them available to your Github workflow.
- Recreate the instance and refresh the credentials using replace operations.
- Teardown the instance using a destroy run. 

This Github action is used internally at HashiCorp for CI workflows testing against an insolated tflocal instance.  

> **How do I get started using a tflocal instance for CI?**
> In Confluence, visit the page: "How to Configure a tflocal-cloud Instance for CI (Github Actions)" which will
> walk you through configuring your workspace to consume the module.
>
> *Note*: This module is only available to HashiCorp employees


### Inputs

- `tfe_hostname` (**Required**): The hostname of the TFC/E instance which holds the workspace that manages your tflocal instance.
- `tfe_token` (**Required**): The token of the TFC/E instance which holds the workspace that manages your tflocal instance.
- `organization` (**Required**): The TFC/E organization that manages the specified workspace.
- `workspace` (**Required**): The name of the TFC/E workspace that manages the tflocal configuration. 
- `build` (**Optional**): If set to `true`, will trigger a run that recreates the tflocal instance. Cannot be `true` if `destroy` is set to `true`. Defaults to `false`.
- `wait-for-run` (**Optional**): If set to `true`, runs executed by this action will poll and await completion. Defaults to `false`.
- `destroy` (**Optional**): If set to `true`, will trigger a destroy run that nukes the tflocal workspace. Defaults to `false`. 

### Outputs

- `tfe_hostname`: The hostname of the tflocal instance.
- `tfe_password`: The seeded site-admin password for this tflocal instance that can be used to log into the UI.
- `tfe_token`: The seeded site-admin token for this tflocal instance that can be used to authenticate API actions.
- `tfe_user1` and `tfe_user2`: The username(s) of a seeded user for this tflocal instance. Used by terraform-provider-tfe acceptance tests. 

NOTE: Outputs are NOT available if `destroy` is set to `true` **or** if `build` is set to `true` and `wait-for-run` is set to `false`. 

## Examples

### Nightly instance rebuild

```yaml
name: Nightly Rebuild 
on:
  workflow_dispatch:
  schedule:
    - cron: 0 0 * * *

jobs:
  instance:
    runs-on: ubuntu-latest
    steps:
     - name: Checkout code
       uses: actions/checkout@v3

     - name: Setup Tflocal
       id: tflocal
       uses: hashicorp-forge/setup-tflocal
       with:
        tfe_hostname: "app.terraform.io"
        tfe_token: ${{ secrets.TFE_TOKEN }} 
        organization: "hashicorp"
        workspace: "my-tflocal-workspace"
        build: true
```

### Ephemeral Instance w/ Tests
```yaml
name: Nightly Test 
on:
  workflow_dispatch:
  schedule:
    - cron: 0 0 * * *

jobs:
  # Build the tflocal instance
  instance:
    runs-on: ubuntu-latest
    steps:
     - name: Checkout code
       uses: actions/checkout@v3

     - name: Setup Tflocal
       id: tflocal
       uses: hashicorp-forge/setup-tflocal
       with:
        tfe_hostname: "app.terraform.io"
        tfe_token: ${{ secrets.TFE_TOKEN }} 
        organization: "hashicorp"
        workspace: "my-tflocal-workspace"
        build: true
        wait-for-run: true
    outputs:
      tfe_hostname: ${{ steps.tflocal.outputs.tfe_hostname }}
      tfe_token: ${{ steps.tflocal.outputs.tfe_token }}

  # Run some test job
  tests:
    runs-on: ubuntu-latest
    needs: instance
    steps:
      - name: Some tests
        env:
          TFE_HOSTNAME: ${{ needs.instance.outputs.tfe_hostname }}
          TFE_TOKEN: ${{ needs.instance.outputs.tfe_token }}
  
  # Destroy the instance
  cleanup:
    runs-on: ubuntu-latest
    needs: [tests]
    if: "${{ always() }}"
    steps:
     - name: Destroy Tflocal
       id: tflocal
       uses: hashicorp-forge/setup-tflocal
       with:
        tfe_hostname: "app.terraform.io"
        tfe_token: ${{ secrets.TFE_TOKEN }} 
        organization: "hashicorp"
        workspace: "my-tflocal-workspace"
        destroy: true
```




