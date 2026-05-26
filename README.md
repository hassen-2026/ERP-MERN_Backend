# ERP MVP Backend (No Frontend)

Backend Node.js/Express pour une petite demo fonctionnelle:
- Auth login JWT
- CRUD produits
- Mouvements de stock (`in` / `out`)
- Alerte stock bas
- CRUD fournisseurs
- Factures fournisseurs avec statuts (`PENDING`, `PAID`, `OVERDUE`)

## 1) Prerequis

- Node.js 18+
- MongoDB local ou MongoDB Atlas

## 2) Installation

```bash
npm install
```

## 3) Configuration

Copier `.env.example` vers `.env` (deja fait dans ce dossier) et adapter si besoin:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.vq71bi9.mongodb.net/?appName=Cluster0
JWT_SECRET=change_me_please
OCR_PROVIDER=textract
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
ADMIN_FIRST_NAME=ERP
ADMIN_LAST_NAME=Admin
ADMIN_EMAIL=admin@erp.local
ADMIN_PASSWORD=admin123
```

## 4) Seed admin

```bash
npm run seed:admin
```

## 5) Lancer le serveur

```bash
npm run dev
```

Health check:
`GET http://localhost:3000/api/health`

## 6) Tester avec Postman

Importer `postman_collection.json`, puis:

1. Executer `Auth - Login`
2. Copier `token` dans la variable `token`
3. Executer `Products - Create`
4. Copier l'id retourne dans la variable `productId`
5. Executer `Stock - Create OUT` puis `Products - Low Stock`
6. Executer `Suppliers - Create`
7. Copier l'id retourne dans la variable `supplierId`
8. Executer `Supplier Invoices - Create`
9. Copier l'id retourne dans la variable `invoiceId`
10. Executer `Supplier Invoices - Refresh Overdue` puis `Supplier Invoices - Mark Paid`

## Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users`
- `POST /api/users/create`
- `PATCH /api/users/update/:id`
- `DELETE /api/users/delete/:id`
- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/products/low-stock`
- `GET /api/stock-movements`
- `POST /api/stock-movements`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/suppliers/:id`
- `PUT /api/suppliers/:id`
- `DELETE /api/suppliers/:id`
- `GET /api/supplier-invoices`
- `POST /api/supplier-invoices`
- `GET /api/supplier-invoices/:id`
- `PATCH /api/supplier-invoices/:id/status`
- `POST /api/supplier-invoices/refresh-overdue`
- `GET /api/clients`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `GET /api/employees`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`
- `GET /api/devis`
- `POST /api/devis`
- `GET /api/devis/:id`
- `PUT /api/devis/:id`
- `DELETE /api/devis/:id`
- `GET /api/commandes`
- `POST /api/commandes`
- `GET /api/commandes/:id`
- `PUT /api/commandes/:id`
- `DELETE /api/commandes/:id`
- `GET /api/achats`
- `POST /api/achats`
- `GET /api/achats/:id`
- `PUT /api/achats/:id`
- `DELETE /api/achats/:id`
- `PATCH /api/achats/:id/receive`
- `POST /api/achats/:id/receive`
- `POST /api/achats/ocr/invoice` (multipart/form-data, field `file`, optional `provider=textract`)
- `GET /api/factures`
- `POST /api/factures`
- `GET /api/factures/:id`
- `PUT /api/factures/:id`
- `DELETE /api/factures/:id`
- `GET /api/paiements`
- `POST /api/paiements`
- `GET /api/paiements/:id`
- `DELETE /api/paiements/:id`
- `GET /api/transporters`
- `POST /api/transporters`
- `PUT /api/transporters/:id`
- `DELETE /api/transporters/:id`
- `GET /api/historique`
- `GET /api/snapshots`
- `POST /api/snapshots`

> Toutes les routes ci-dessus (sauf `/api/health` et `/api/auth/login`) requierent un token JWT `Bearer`.

## Déploiement automatisé sur EC2

Le backend est prêt pour un déploiement Docker sur une instance EC2.

### Fichiers ajoutés

- `Dockerfile` pour builder l'image backend.
- `.dockerignore` pour exclure `.env`, `node_modules` et les fichiers locaux.
- `.github/workflows/deploy.yml` pour déployer automatiquement sur EC2 à chaque push sur `main`.

### Secrets GitHub à créer

Crée ces secrets dans le dépôt GitHub du backend :

- `EC2_HOST` : l'adresse IP publique ou le DNS de ton instance EC2.
- `EC2_USER` : l'utilisateur SSH, par exemple `ubuntu` ou `ec2-user`.
- `EC2_SSH_KEY` : la clé privée SSH utilisée pour se connecter à l'instance.
- `REPO_URL` : l'URL du dépôt Git du backend, par exemple `git@github.com:<org>/ERP-MERN_Backend.git` ou une URL HTTPS avec token.

 Le workflow GitHub Actions doit pouvoir joindre `EC2_HOST` sur le port 22 pour établir la connexion SSH lors du déploiement.

### Préparation de l'instance EC2

1. Installer Docker sur l'instance.
2. Créer le dossier `/opt/ERP-MERN_Backend` ou laisser le workflow le faire.
3. Copier le fichier `.env` sur l'instance EC2 dans `/opt/ERP-MERN_Backend/.env`.
4. Ouvrir les ports `22` et `5000` dans le Security Group.

### Déploiement

À chaque push sur `main`, GitHub Actions se connecte en SSH à l'instance, met à jour le code, reconstruit l'image Docker et relance le conteneur `erp-backend`.

