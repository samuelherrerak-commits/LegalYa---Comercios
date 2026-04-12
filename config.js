// ==========================================
// CONFIGURACIÓN DE IDENTIDAD Y SEGURIDAD
// ==========================================

const EMPRESA = { 
    NOMBRE: 'INVERSIONES KEYDAN', 
    RIF: 'J30580323',
    UBICACION: 'Caracas, Venezuela'
};

const USUARIOS = [
    {
        usuario: "Samuel Herrera",
        clave: "040904",
        rol: "ADMIN",
        nombreEmpresa: "INVERSIONES KEYDAN",
        rif: "J30580323",
        UBICACION: 'Caracas, Venezuela'
    },
    {
        usuario: "demo",
        clave: "demo",
        rol: "USER",
        nombreEmpresa: "COMERCIAL DEMO",
        rif: "J-00000000",
        colorTema: "emerald"
    },
    
];

// ==========================================
// PLAN DE CUENTAS COMPLETO (NIC PARA PYMES)
// ==========================================
const CHART_OF_ACCOUNTS = {
    // --- 1. ACTIVOS ---
    "1.1.01.01": { nombre: "Caja Principal ($)", grupo: "Activo Corriente", naturaleza: "Deudora", visibilidad: ["pos", "expenses", "close"] },
    "1.1.01.02": { nombre: "Caja Principal (Bs)", grupo: "Activo Corriente", naturaleza: "Deudora", visibilidad: ["pos", "expenses", "close"] },
    "1.1.01.03": { nombre: "Bancos Nacionales", grupo: "Activo Corriente", naturaleza: "Deudora", visibilidad: ["pos", "expenses", "close"] },
    "1.1.02.01": { nombre: "Cuentas por Cobrar Clientes", grupo: "Activo Corriente", naturaleza: "Deudora", visibilidad: ["debts"] },
    "1.1.03.01": { nombre: "Inventario de Mercancía", grupo: "Activo Corriente", naturaleza: "Deudora", visibilidad: ["purchase", "inventory"] },
    
    // --- 2. PASIVOS ---
    "2.1.01.01": { nombre: "Proveedores por Pagar", grupo: "Pasivo Corriente", naturaleza: "Acreedora", visibilidad: ["purchase", "debts"] },
    "2.1.02.01": { nombre: "Sueldos y Salarios por Pagar", grupo: "Pasivo Corriente", naturaleza: "Acreedora", visibilidad: ["expenses"] },

    // --- 4. INGRESOS ---
    "4.1.01.01": { nombre: "Ventas de Mercancía", grupo: "Ingresos", naturaleza: "Acreedora", visibilidad: ["pos"] },
    "4.1.03.01": { nombre: "Diferencial Cambiario", grupo: "Ingresos", naturaleza: "Acreedora", visibilidad: ["close"] },

    // --- 5. COSTOS ---
    "5.1.01.01": { nombre: "Costo de Ventas", grupo: "Costos", naturaleza: "Deudora", visibilidad: ["pos"] },

    // --- 6. GASTOS ---
    "6.1.01.01": { nombre: "Gastos de Personal", grupo: "Gastos Operativos", naturaleza: "Deudora", visibilidad: ["expenses"] },
    "6.1.02.01": { nombre: "Alquiler y Condominio", grupo: "Gastos Operativos", naturaleza: "Deudora", visibilidad: ["expenses"] },
    "6.1.05.01": { nombre: "Comisiones Bancarias", grupo: "Gastos Financieros", naturaleza: "Deudora", visibilidad: ["expenses"] }
};

// Alias Contables para compatibilidad
const CUENTAS = {
    CAJA_USD: '1.1.01.01',
    CAJA_BS: '1.1.01.02',
    BANCOS: '1.1.01.03',
    CXC: '1.1.02.01',
    INVENTARIO: '1.1.03.01',
    CXP: '2.1.01.01',
    VENTAS: '4.1.01.01',
    DIF_CAMB: '4.1.03.01',
    COSTO_VTA: '5.1.01.01'
};

// EXPORTACIÓN GLOBAL PARA APP.JS
if (typeof window !== 'undefined') {
    window.EMPRESA = EMPRESA;
    window.USUARIOS = USUARIOS;
    window.CHART_OF_ACCOUNTS = CHART_OF_ACCOUNTS;
    window.CUENTAS = CUENTAS;
}