# Stellar-Odoo Integration

This repository integrates the Stellar blockchain with [Odoo](https://www.odoo.com/), tracking order movements within Odoo.

## Getting Started

### Dependencies

- Node v.18+
- Odoo v.17+
- Docker Compose v.3

### Installation

```bash
git clone https://github.com/TYPIQO/typiqo-open-source-api.git
npm i
docker-compose up #optional
```

## Configuration

### Database Configuration

You need to define this `.env` variables:

```
# Mysql
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_NAME=
```

Fill in the fields with appropriate data or use dummy data. You can set up a database instance with `docker-compose up`.

### Odoo Configuration

Ensure the 'sale.order' and 'stock.picking' modules are installed in Odoo. Define the following `.env` variables:

```
#Odoo
ODOO_URL=
ODOO_DATABASE=
ODOO_USERNAME=
ODOO_PASSWORD=
```

### Stellar Configuration

You need to create 4 Stellar accounts. Only the ISSUER account will pay the transaction fees, and the other accounts should have an appropiate balance to maintain trustlines.

Define the following `.env` variables:

```
# Stellar
STELLAR_NETWORK=
STELLAR_ISSUER_SECRET_KEY=
STELLAR_DISTRIBUTOR_SECRET_KEY=
STELLAR_CONFIRM_SECRET_KEY=
STELLAR_CONSOLIDATE_SECRET_KEY=
```

### Server Configuration

You need to define this `.env` variable that stores the production server url:

```
SERVER_URL=
```

This is required to allow Odoo Webhook configuration.

## Usage

1. Upon deploying the server for the first time, the code will create the necessary Webhooks and Automations in Odoo.

2. Every time a SaleOrder is moved in Odoo, a Stellar transaction will be initiated.

3. You can check the order transactions via the following endpoint:

```
GET /api/stellar/trace/:orderId
```

And the API responses will look like this:

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

The available movement types are: `"create", "confirm", "consolidate", "deliver"`.
For those transactions that fails due to Stellar server, the transaction hash will be empty.
