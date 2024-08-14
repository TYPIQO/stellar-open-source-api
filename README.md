# Stellar-Odoo Integration

This repository integrates the Stellar blockchain with [Odoo](https://www.odoo.com/) to provide transparent and public tracking of order movements within the Odoo application. This integration ensures that all order movements are securely logged on the Stellar blockchain, providing decentralized traceability.

## Table of Contents

- [Getting Started](#getting-started)
- [Dependencies](#dependencies)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Database Configuration](#database-configuration)
  - [Odoo Configuration](#odoo-configuration)
  - [Stellar Configuration](#stellar-configuration)
  - [Server Configuration](#server-configuration)
- [Usage](#usage)
- [Contributing](#contributing)

## Getting Started

This guide will walk you through the setup process for integrating Stellar with Odoo to enable transparent order tracking.

### Dependencies

- Node v.18+
- Odoo v.17+
- Docker Compose v.3

### Installation

Follow these steps to get started:

1. **Clone the repository**:

```bash
git clone https://github.com/TYPIQO/typiqo-open-source-api.git
cd typiqo-open-source-api
```

2. **Install the necessary dependencies**:

```bash
npm i
```

3. **[Optional] Start the application with Docker Compose**:

```bash
docker-compose up
```

## Configuration

### Database Configuration

Set up the following `.env` variables for your database connection:

```
# MySQL configuration
DB_HOST=          # Example: localhost
DB_PORT=          # Example: 3306
DB_USERNAME=      # Example: root
DB_PASSWORD=      # Example: rootpassword
DB_NAME=          # Name of the database to use
```

You can either use an existing database or leverage the provided Docker image.

### Odoo Configuration

Ensure that the 'sale.order' and 'stock.picking' modules are installed in Odoo. Then, configure the following `.env` variables:

```
# Odoo configuration
ODOO_URL=         # Example: http://odoo_db.odoo.com
ODOO_DATABASE=    # Example: odoo_db
ODOO_USERNAME=    # Odoo login username
ODOO_PASSWORD=    # Odoo login password
```

### Stellar Configuration

Create a Stellar account and set the following `.env` variables:

```
# Stellar configuration
STELLAR_NETWORK=               # Example: testnet
STELLAR_ISSUER_SECRET_KEY=     # Secret key of the Stellar issuer account
```

This integration uses Stellar Muxed Accounts for traceability. This are the Muxed IDs for different traceability nodes:

| Node        | Muxed ID |
| ----------- | -------- |
| CREATE      | 1        |
| CONFIRM     | 2        |
| CONSOLIDATE | 3        |
| DELIVER     | 4        |
| CANCEL      | 5        |

### Server Configuration

Define the following `.env` variable for the production server URL:

```
SERVER_URL=    # URL of the production server
```

This is required for Odoo Webhook configuration.

## Usage

1. **Deploying the Server**:
   Upon deploying the server for the first time, the code will automatically set the ISSUER ACCOUNT flags to restrict asset possession

2. **Creating Odoo Automations**:
   Call the endpoint /automation/batch to create Odoo automations. Ensure the SERVER_URL variable is defined before doing this.

```
POST /api/automation/batch
```

3. **Initiating Stellar Transactions**:
   Every time a SaleOrder is moved in Odoo, a corresponding Stellar transaction will be initiated.

4. **Checking Order Transactions**:
   Use the following endpoint to check order transactions:

```
GET /api/stellar/trace/:orderId
```

Example API response:

```json
[
  {
    "id": 25,
    "createdAt": "2024-03-25T23:04:11.329Z",
    "updatedAt": "2024-03-25T23:04:11.329Z",
    "orderId": 313,
    "type": "create",
    "hash": "dda6ada6465c53b5d80e0f72984a767b92f3fb0cb65282601498a47c06990a8a",
    "timestamp": "2024-03-25T20:04:10Z"
  }
]
```

The available movement types are: "create", "confirm", "consolidate", "deliver", "cancel". For transactions that fail due to Stellar server issues, the transaction hash will be empty.

## Contributing

If you'd like to contribute to this project, please fork the repository and use a feature branch. Pull requests are warmly welcome.
