# 📊 Portfolio Tracker (Jubilación)

Aplicación fullstack para gestionar y analizar un portfolio de inversiones (acciones, CEDEARs, crypto, FX y cash) con valuación en tiempo (casi) real.

Incluye tracking de PnL, posiciones, histórico, trading y comparación contra benchmarks.

---

## 🚀 Demo funcional

* Dashboard con KPIs (valor, costo, PnL)
* Holdings con cálculo de posiciones
* Transactions (movimientos unificados)
* Market (precios en tiempo real)
* History (evolución del portfolio)
* Trading (resultado de operaciones)

---

## 🧠 Stack tecnológico

* **Frontend:** React (Vite + Tailwind + Recharts)
* **Backend:** Node.js + Express
* **Base de datos:** Google BigQuery
* **APIs externas:** TwelveData, CoinGecko

---

## ⚙️ Setup rápido (5 minutos)

### 1. Clonar el repo

```bash
git clone https://github.com/hnr83/portfolio-tracker
cd portfolio-tracker
npm install
```

---

### 2. Login a Google Cloud (BigQuery)

Este proyecto usa autenticación local con tu cuenta de Google.

Instalar CLI de Google Cloud y loguearte:

```bash
gcloud auth application-default login
```

👉 Se abre el navegador, iniciás sesión y listo.

---

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

```env
# === BIGQUERY ===
BIGQUERY_PROJECT_ID=tu_proyecto
BIGQUERY_DATASET_ID=portfolio
BIGQUERY_LOCATION=US

# === APIS ===
TWELVE_DATA_API_KEY=tu_api_key

# === FRONTEND ===
VITE_API_BASE_URL=http://localhost:3000
```

⚠️ Importante:

* No es necesario modificar el código
* Todas las queries usan estas variables dinámicamente
* Cada usuario puede usar su propio proyecto de BigQuery

---

### 4. Crear la base de datos

```bash
npm run db:setup
```

Esto automáticamente:

* crea el dataset en BigQuery
* crea tablas
* crea vistas
* carga datos base

---

### 5. Levantar la app

```bash
npm run dev
```

---

## 📂 Estructura del proyecto

```
/db
  /schema
    /tables      # CREATE TABLE
    /views       # CREATE VIEW
  /seeds         # datos base
  /scripts       # export y setup

/backend
  /controllers
  /routes
  /services
  /jobs

/frontend
  /components
  /views
```

---

## 🔄 Scripts disponibles

### Exportar schema actual

```bash
npm run db:export
```

---

### Crear DB desde cero

```bash
npm run db:setup
```

---

## 🧠 Modelo de datos

El sistema está basado en un modelo de **movimientos unificados**:

* `movements` → fuente única de verdad
* `vw_positions` → posiciones netas
* `vw_portfolio_valued` → valuación + PnL
* `prices` → precios históricos
* `fx_rates` → tipos de cambio
* `ticker_master` → configuración de activos
* `cedear_master` → mapping CEDEAR → underlying

---

## 📈 Features principales

* 📊 Cálculo automático de posiciones
* 💰 PnL en USD y ARS
* 🔄 Integración con precios en tiempo real
* 🪙 Soporte crypto + acciones + CEDEARs
* 📉 Histórico del portfolio (snapshots)
* 📊 Benchmark vs índices
* ⚡ Jobs automáticos (prices / FX / snapshot)
* 📉 Trading integrado (PnL separado)

---

## ⚠️ Requisitos

* Node.js 18+
* Cuenta en Google Cloud
* BigQuery habilitado

---

## 💡 Notas importantes

* No se incluyen datos personales
* Cada usuario usa su propio proyecto de BigQuery
* Las API keys externas deben configurarse en `.env`
* No subir `.env` al repositorio

---

## 🚀 Roadmap

* Multi-user
* Deploy cloud
* Integración IBKR
* Alertas de portfolio
* Mobile UI

---

## 👤 Autor

Horacio Rebasa
