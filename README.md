# 🧼 Simulador de Marketing Multi-Equipo
**COM400A — Estrategia Comercial · 20 Trimestres · Hasta 30 Equipos**

---

## 🚀 Instalación en Windows

```bash
# 1. Crea la carpeta y copia los archivos
mkdir C:\Win\simulador-marketing

# 2. Abre CMD en esa carpeta y ejecuta:
npm install
node server.js
```
O simplemente doble clic en `iniciar.bat`

Abre el navegador en: **http://localhost:3000**

---

## 👥 Roles y Accesos

| Rol | Acceso | Usuario inicial |
|-----|--------|-----------------|
| **Profesor/Admin** | http://localhost:3000 | `admin` / `admin123` |
| **Equipos** | http://localhost:3000 | ID creado por admin |

---

## 📋 Flujo del Simulador

```
Admin crea equipos → Equipos ingresan decisiones → Admin ejecuta simulación
→ Equipos ven sus resultados y reportes comprados → Admin abre siguiente ronda
→ (repite 20 veces)
```

### Panel Admin
- **Gestión Equipos**: crear hasta 30 equipos, asignar contraseñas
- **Control Rondas**: ver entregas en tiempo real, ejecutar simulación, abrir siguiente ronda
- **Resultados**: tabla completa con nombres de todos los equipos + gráficos
- **Historial**: todas las 20 rondas

### Panel Equipo
- **Decisiones**: formulario completo, guardar borrador o enviar al profesor
- **Resultados**: historial de todas sus rondas con gráficos de evolución
- **Reportes**: solo los estudios que compraron en cada ronda
- **Manual**: referencia completa del simulador

---

## 🔍 Reportes de Investigación (por ronda)

| Reporte | Costo | Información |
|---------|-------|-------------|
| Segmentación | Bs 1,000 | Tamaños, demanda, tendencias |
| Precios | Bs 1,200 | Rangos de precios aceptables |
| Competencia | Bs 1,500 | Estadísticas del mercado (anónimo) |
| Canales | Bs 800 | Factores de percepción por canal |

---

## 📁 Estructura del Proyecto

```
simulador-marketing/
├── server.js              ← Servidor Express + todas las rutas API
├── src/
│   ├── constants.js       ← Parámetros, segmentos, productos, canales
│   ├── engine.js          ← Motor de cálculo (replica el Excel)
│   ├── reports.js         ← Generador de reportes de investigación
│   ├── storage.js         ← Persistencia JSON (data/db.json)
│   ├── auth.js            ← Hashing PBKDF2 + middleware de roles
│   └── session.js         ← Sesiones por cookie (sin dependencias extra)
├── public/
│   ├── index.html         ← SPA unificada (login + admin + equipo)
│   ├── styles.css
│   └── app.js
└── data/
    └── db.json            ← Base de datos (auto-creada al iniciar)
```

---

## 🔒 Seguridad

- Contraseñas hasheadas con **PBKDF2 SHA-256** (100K iteraciones)
- Sesiones por cookie HttpOnly
- Rutas protegidas por rol (`admin` / `equipo`)
- Los equipos **solo ven sus propios datos**
- Los equipos **nunca ven nombres** de otros equipos en reportes

---

## ⚙️ Cambiar contraseña del admin

En `data/db.json`, o desde el panel admin:
1. Ve a **Equipos** → botón 🔑 junto a cualquier usuario

Para cambiar la clave del admin directamente ejecuta:
```bash
node -e "const {hashPassword}=require('./src/auth'); console.log(hashPassword('NuevaClave123'))"
```
Y reemplaza el campo `password` del admin en `data/db.json`.
