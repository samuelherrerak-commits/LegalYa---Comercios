const { useState, useMemo, useEffect, createContext, useContext } = React;

// ==========================================
// CONSTANTES Y ALIAS CONTABLES
// ==========================================
const fallbackCuentas = {
    CAJA_USD: '1.1.01.01', CAJA_BS: '1.1.01.02', BANCOS: '1.1.01.03',
    CXC: '1.1.02.01', INVENTARIO: '1.1.03.01', CXP: '2.1.01.01',
    VENTAS: '4.1.01.01', DIF_CAMB: '4.1.03.01', COSTO_VTA: '5.1.01.01'
};

const CTA = typeof window !== 'undefined' && window.CUENTAS ? window.CUENTAS : fallbackCuentas;
const NOMBRE_EMPRESA = typeof window !== 'undefined' && window.EMPRESA ? window.EMPRESA.NOMBRE : 'INVERSIONES KEYDAN';
const RIF_EMPRESA = typeof window !== 'undefined' && window.EMPRESA ? window.EMPRESA.RIF : 'J30580323';

// ==========================================
// COMPONENTES DE INTERFAZ Y UTILIDADES
// ==========================================
const Icon = ({ name, size = 20, className = "" }) => {
    useEffect(() => { if (window.lucide) window.lucide.createIcons(); }, [name]);
    return <i data-lucide={name.toLowerCase()} style={{ width: size, height: size }} className={className}></i>;
};

const MenuButton = ({ onClick, label, icon, color }) => (
    <button onClick={onClick} className={`p-4 rounded-[2rem] flex flex-col items-center justify-center gap-2 shadow-sm hover:scale-105 transition-all ${color}`}>
        <Icon name={icon} size={24} />
        <span className="font-black uppercase text-[9px] tracking-wider text-center">{label}</span>
    </button>
);

const StatCard = ({ label, val, icon, color, bg }) => (
    <div className={`${bg} p-6 rounded-[2rem] flex flex-col gap-3 border border-white/50 shadow-sm`}>
        <div className={`p-3 rounded-2xl ${color} bg-white shadow-sm w-max`}><Icon name={icon} size={20} /></div>
        <div>
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className={`text-xl font-black ${color}`}>{val}</p>
        </div>
    </div>
);

const InputField = ({ label, icon, color, value, onChange }) => (
    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border-2 border-transparent focus-within:border-slate-200 transition-all">
        <div className={`${color} text-white p-3 rounded-2xl shadow-sm`}><Icon name={icon}/></div>
        <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase">{label}</p>
            <input type="number" placeholder="0.00" className="w-full bg-transparent text-xl font-black outline-none" value={value} onChange={e => onChange(e.target.value)} />
        </div>
    </div>
);

const ResultRow = ({ label, system, diff, isUsd = false }) => (
    <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
            <p className="text-xs opacity-50">Sistema: {isUsd ? '$' : ''}{system.toFixed(2)}</p>
        </div>
        <div className="text-right">
            <p className={`text-lg font-black ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {diff >= 0 ? '+' : ''}{diff.toFixed(2)} {isUsd ? '$' : 'Bs'}
            </p>
        </div>
    </div>
);

// ==========================================
// CONTEXTO Y PROVEEDOR GLOBAL
// ==========================================
const AppContext = createContext();

const AppProvider = ({ children }) => {
    const getSaved = (key, fallback) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : fallback;
        } catch (e) { return fallback; }
    };

    const [isInit, setIsInit] = useState(() => localStorage.getItem('legaly_init') === 'true');
    const [tasaBCV, setTasaBCV] = useState(() => parseFloat(localStorage.getItem('legaly_tasa')) || 0);
    const [currentUser, setCurrentUser] = useState(() => getSaved('legaly_user', null));
    const [journal, setJournal] = useState(() => getSaved('legaly_journal', []));
    const [contacts, setContacts] = useState(() => getSaved('legaly_contacts', []));
    const [isLocked, setIsLocked] = useState(() => localStorage.getItem('legaly_locked') === 'true');
    const [inventory, setInventory] = useState([]);

    useEffect(() => {
        localStorage.setItem('legaly_init', isInit);
        localStorage.setItem('legaly_tasa', tasaBCV.toString());
        localStorage.setItem('legaly_user', JSON.stringify(currentUser));
        localStorage.setItem('legaly_journal', JSON.stringify(journal));
        localStorage.setItem('legaly_contacts', JSON.stringify(contacts));
        localStorage.setItem('legaly_locked', isLocked);
    }, [isInit, tasaBCV, currentUser, journal, contacts, isLocked]);

    const updateInventory = (rows) => {
        const stockMap = {};
        rows.forEach(row => {
            const cuenta = String(row.Cuenta || '').trim();
            const conceptoStr = String(row.Concepto || '').toUpperCase();
            
            if (cuenta === CTA.INVENTARIO && conceptoStr) {
                let name = conceptoStr.split('|')[0].replace(/^(ENTRADA|SALIDA|RECEPCION|VENTA|COMPRA|COSTO VENTA|COSTO)\s*:?\s*/i, '').trim();
                let qty = parseFloat(row.Cantidad) || 0;
                
                if (qty === 0) {
                    const match = conceptoStr.match(/Cant:\s*([\d.]+)/i) || conceptoStr.match(/de\s*([\d.]+)\s*(kg|unidades)/i);
                    if (match) qty = parseFloat(match[1]);
                }
                
                if (!name || name === 'ASIENTO DE APERTURA') return;
                
                if (!stockMap[name]) stockMap[name] = { name, stock: 0, unit: row.Unidad_Medida || 'und', cost: 0, sellPrice: parseFloat(row.Precio_Venta) || 0 };
                
                if (row.Debe > 0) { stockMap[name].stock += qty; if(qty > 0) stockMap[name].cost = (row.Debe / qty); }
                if (row.Haber > 0) stockMap[name].stock -= qty;
                if (parseFloat(row.Precio_Venta) > 0) stockMap[name].sellPrice = parseFloat(row.Precio_Venta);
            }
        });
        return Object.values(stockMap).map(p => ({ ...p, id: `p-${p.name}` }));
    };

    useEffect(() => { setInventory(updateInventory(journal)); }, [journal]);

    const addTransaction = (newRows) => {
        if (isLocked) return alert("SISTEMA BLOQUEADO. Descargue el libro diario e inicie un nuevo ciclo.");
        setJournal(prev => [...prev, ...newRows]);
    };

    const value = { 
        isInit, setIsInit, tasaBCV, setTasaBCV, currentUser, setCurrentUser, 
        journal, setJournal, contacts, setContacts, isLocked, setIsLocked, 
        inventory, setInventory, addTransaction, updateInventory 
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ==========================================
// PANTALLAS DE ACCESO Y CONFIGURACIÓN INICIAL
// ==========================================
const LoginScreen = () => {
    const { setCurrentUser } = useContext(AppContext);
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        const usuarios = window.USUARIOS || [];
        const validUser = usuarios.find(u => u.usuario === user && u.clave === pass);
        
        if (validUser) { 
            setError(''); 
            setCurrentUser(validUser); 
        } else { 
            setError('Credenciales incorrectas. Verifique usuario y contraseña.'); 
            setPass(''); 
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px]"></div>

            <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700 p-10 rounded-[3rem] w-full max-w-md shadow-2xl relative z-10 animate-in">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
                        <Icon name="Lock" size={40} className="text-white"/>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">Acceso al Sistema</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">LegalYa Comercios</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && <div className="bg-rose-500/10 text-rose-400 p-4 rounded-2xl text-xs font-bold text-center border border-rose-500/20">{error}</div>}
                    <div className="space-y-4">
                        <div className="relative">
                            <Icon name="User" className="absolute left-4 top-4 text-slate-500" />
                            <input type="text" required placeholder="Usuario Registrado" className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl font-bold outline-none focus:border-blue-500 transition-all" value={user} onChange={e => setUser(e.target.value)} />
                        </div>
                        <div className="relative">
                            <Icon name="Key" className="absolute left-4 top-4 text-slate-500" />
                            <input type="password" required placeholder="Contraseña" className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl font-bold outline-none focus:border-blue-500 transition-all" value={pass} onChange={e => setPass(e.target.value)} />
                        </div>
                    </div>
                    <button type="submit" className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black uppercase italic shadow-lg transition-all flex justify-center items-center gap-2 hover:scale-[1.02]">
                        Verificar Identidad <Icon name="ArrowRight" size={18}/>
                    </button>
                </form>
            </div>
        </div>
    );
};

const StartScreen = () => {
    const { currentUser, setTasaBCV, setJournal, setIsInit, updateInventory, setInventory } = useContext(AppContext);
    const [tasa, setTasa] = useState('');
    const [loading, setLoading] = useState(false);
    const [listo, setListo] = useState(false);

    const handleLoadExcel = (e) => {
        const file = e.target.files[0]; 
        if (!file) return;
        if (!window.XLSX) return alert("⚠️ La librería XLSX no está cargada. Verifique su conexión.");
        
        setLoading(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                const isOld = (rows[0] || []).length <= 13;
                
                const parsed = rows.slice(1).filter(l => l.length > 0 && l[2]).map(c => {
                    return isOld 
                        ? { Empresa: String(c[0]||''), RIF: String(c[1]||''), Fecha: String(c[2]||''), Hora: String(c[3]||''), Cuenta: String(c[4]||'').trim(), Nombre: String(c[5]||''), Concepto: String(c[6]||''), Debe: parseFloat(c[7])||0, Haber: parseFloat(c[8])||0, Unidad_Medida: String(c[9]||''), Tasa: parseFloat(c[10])||0, Ref: String(c[11]||''), Precio_Venta: parseFloat(c[12])||0, Cantidad: 0, Entidad: 'GENERAL' }
                        : { Empresa: String(c[0]||''), RIF: String(c[1]||''), Fecha: String(c[2]||''), Hora: '', Nombre: String(c[3]||''), Cuenta: String(c[4]||c[3]||'').trim(), Concepto: String(c[5]||''), Debe: parseFloat(c[6])||0, Haber: parseFloat(c[7])||0, Tasa: parseFloat(c[10])||0, Ref: String(c[11]||''), Cantidad: parseFloat(c[12])||0, Unidad_Medida: String(c[13]||''), Precio_Venta: parseFloat(c[14])||0, Entidad: String(c[15]||'') };
                });
                
                setJournal(parsed); 
                setInventory(updateInventory(parsed)); 
                setListo(true);
            } catch (err) { 
                alert("Error al leer el archivo Excel."); 
            } finally { 
                setLoading(false); 
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const cargarLocal = () => {
        setLoading(true);
        setTimeout(() => { setListo(true); setLoading(false); }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 animate-in">
            <div className="bg-slate-800 p-10 rounded-[2.5rem] w-full max-w-md border border-slate-700 shadow-2xl">
                <div className="text-center mb-8">
                    <h2 className="text-blue-500 font-black tracking-widest text-[10px] uppercase mb-2">Apertura de Jornada</h2>
                    <h1 className="text-2xl font-black text-white uppercase">{currentUser?.nombreEmpresa}</h1>
                    <p className="text-slate-400 text-xs font-bold mt-1 uppercase">Usuario: {currentUser?.usuario}</p>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700">
                        <label className="block text-slate-500 text-[10px] font-black uppercase mb-3 ml-2">Tasa BCV del Día</label>
                        <div className="flex items-center">
                            <span className="text-xl font-mono text-slate-500 mr-3 font-bold">Bs/USD</span>
                            <input type="number" value={tasa} onChange={e => setTasa(e.target.value)} className="w-full bg-transparent text-white text-4xl font-mono outline-none focus:text-blue-400" placeholder="0.00" />
                        </div>
                    </div>

                    <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-slate-500 text-[10px] font-black uppercase ml-2">Libro Diario</label>
                            {listo && <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-1 rounded-full font-bold">LISTO</span>}
                        </div>
                        
                        {!listo ? (
                            <div className="space-y-3">
                                <button onClick={cargarLocal} disabled={loading} className="w-full py-4 bg-slate-800 text-slate-300 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-all border border-slate-700">
                                    {loading ? 'Cargando...' : 'Sincronizar Memoria Local'}
                                </button>
                                <div className="relative">
                                    <input type="file" id="excelFile" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleLoadExcel}/>
                                    <label htmlFor="excelFile" className="w-full py-4 bg-transparent border-2 border-dashed border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-500 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all">
                                        <Icon name="FileSpreadsheet" size={16} /> Cargar Respaldo (Excel)
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-slate-400 text-xs font-medium ml-2 bg-slate-800 p-4 rounded-2xl">
                                <Icon name="CheckCircle" size={18} className="text-emerald-500" /> Transacciones listas.
                            </div>
                        )}
                    </div>

                    <button disabled={!tasa || !listo || tasa <= 0} onClick={() => { setTasaBCV(parseFloat(tasa)); setIsInit(true); }} className={`w-full py-6 bg-${currentUser?.colorTema || 'blue'}-600 text-white rounded-[2rem] font-black uppercase italic shadow-lg disabled:opacity-20 hover:scale-[1.02] transition-all`}>
                        Iniciar Operaciones
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// MÓDULOS OPERATIVOS DEL SISTEMA
// ==========================================

const Dashboard = ({ setView }) => {
    const { currentUser, journal, tasaBCV, isLocked, setIsInit, setCurrentUser } = useContext(AppContext);
    const [topFilter, setTopFilter] = useState('dia');

    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const tema = currentUser?.colorTema || 'blue';

    const stats = useMemo(() => {
        let usd = 0, bsFisico = 0, bancosFisico = 0, cxc = 0, gastos = 0;
        journal.forEach(r => {
            const neto = r.Debe - r.Haber;
            const tH = parseFloat(r.Tasa) || tasaBCV;
            const cta = String(r.Cuenta || '').trim();
            if (cta === CTA.CAJA_USD || cta.includes('$')) usd += neto;
            if (cta === CTA.CAJA_BS || cta.includes('Bs')) bsFisico += (neto * tH);
            if (cta === CTA.BANCOS || cta.includes('Banco')) bancosFisico += (neto * tH);
            if (cta === CTA.CXC || cta.toUpperCase().includes('COBRAR')) cxc += neto;
            if (cta.startsWith('6.') && r.Debe > 0) gastos += r.Debe;
        });
        return { usd, bsFisico, bancosFisico, cxc, gastos };
    }, [journal, tasaBCV]);

    const recentActivity = useMemo(() => {
        const grouped = {};
        for (let i = journal.length - 1; i >= 0; i--) {
            const r = journal[i];
            const rRef = String(r.Ref || '');
            if (!rRef) continue;

            if (!grouped[rRef]) {
                let type = 'Registro'; let icon = 'Circle'; let color = 'text-slate-500'; let bg = 'bg-slate-100';
                
                if (rRef.startsWith('VTA')) { type = 'Venta'; icon = 'ShoppingCart'; color = 'text-emerald-600'; bg = 'bg-emerald-100'; }
                else if (rRef.startsWith('GST')) { type = 'Gasto'; icon = 'TrendingDown'; color = 'text-rose-600'; bg = 'bg-rose-100'; }
                else if (rRef.startsWith('REC')) { type = 'Compra'; icon = 'Truck'; color = 'text-blue-600'; bg = 'bg-blue-100'; }
                else if (rRef.startsWith('RCP')) { type = 'Abono'; icon = 'UserCheck'; color = 'text-orange-600'; bg = 'bg-orange-100'; }

                const conceptoStr = String(r.Concepto || '');
                grouped[rRef] = { ref: rRef, time: String(r.Hora || ''), date: String(r.Fecha || ''), type, icon, color, bg, desc: conceptoStr.split('|')[0].trim(), amount: 0 };
            }
            const g = grouped[rRef];
            const cta = String(r.Cuenta || '').trim();
            if (rRef.startsWith('VTA') && (cta === CTA.VENTAS || cta.toUpperCase().includes('VENTA'))) g.amount += r.Haber;
            else if (rRef.startsWith('GST') && (cta.startsWith('6.') || cta.toUpperCase().includes('GASTO'))) g.amount += r.Debe;
            else if (rRef.startsWith('REC') && (cta === CTA.INVENTARIO || cta.toUpperCase().includes('INVENTARIO'))) g.amount += r.Debe;
            else if (rRef.startsWith('RCP') && (cta === CTA.CXC || cta.toUpperCase().includes('COBRAR'))) g.amount += r.Haber;
        }
        return Object.values(grouped).slice(0, 8); 
    }, [journal]);

    const topDebtors = useMemo(() => {
        const balances = {};
        journal.filter(t => String(t.Cuenta||'').trim() === CTA.CXC || String(t.Cuenta||'').toUpperCase().includes('COBRAR')).forEach(t => {
            const conceptoStr = String(t.Concepto || '');
            const match = conceptoStr.match(/Cliente:\s*(.+)$/i);
            const cliente = match ? match[1].trim() : (String(t.Entidad || "DESCONOCIDO"));
            if (!balances[cliente]) balances[cliente] = 0;
            balances[cliente] += (parseFloat(t.Debe) || 0) - (parseFloat(t.Haber) || 0);
        });
        return Object.entries(balances).filter(([_, bal]) => bal > 0.01).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, total]) => ({ name, total }));
    }, [journal]);

    const topProducts = useMemo(() => {
        const salesMap = {};
        journal.filter(row => String(row.Cuenta||'').trim() === CTA.VENTAS).forEach(row => {
            const conceptoStr = String(row.Concepto || '');
            const parts = conceptoStr.split('|').map(s => s.trim());
            let name = parts[0].replace(/^(Venta de)\s*/i, '').split(' de ')[1]?.trim().toUpperCase() || parts[0].replace(/^(Venta de)\s*/i, '').trim().toUpperCase();
            if (!name) return;
            const qtyStr = parts[0].match(/(\d+(\.\d+)?)/);
            const qty = qtyStr ? parseFloat(qtyStr[0]) : 0;
            if (!salesMap[name]) salesMap[name] = { name, totalQty: 0 };
            salesMap[name].totalQty += qty;
        });
        return Object.values(salesMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5); 
    }, [journal]);

    const handleLogout = () => {
        if(confirm("¿Seguro que desea cerrar sesión?")) { setIsInit(false); setCurrentUser(null); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in">
            <div className="lg:col-span-8 flex flex-col gap-6">
                
                <div className="flex justify-between items-end bg-slate-900 text-white p-8 rounded-[3rem] shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-4xl font-black italic tracking-tighter uppercase">LegalYa <span className={`text-${tema}-500`}>Comercios</span></h1>
                        <p className={`text-${tema}-200 font-bold mt-1 text-sm uppercase tracking-widest`}>{nombreEmp}</p>
                    </div>
                    <div className="text-right relative z-10 flex flex-col items-end">
                        {isLocked && <span className="bg-rose-500 text-white px-3 py-1 rounded-full font-black text-[10px] uppercase mb-2 animate-pulse shadow-rose-500/50 shadow-lg">Caja Cerrada</span>}
                        <div className="bg-white/10 px-5 py-3 rounded-2xl backdrop-blur-sm border border-white/5 mb-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Tasa Hoy</span>
                            <span className={`text-xl font-black text-${tema}-400`}>{tasaBCV.toFixed(2)} Bs</span>
                        </div>
                        <button onClick={handleLogout} className="text-[10px] font-black uppercase text-rose-400 hover:text-rose-300 transition-colors">Cerrar Sesión</button>
                    </div>
                    <Icon name="Activity" size={200} className="absolute -right-10 -bottom-10 text-white/5" />
                </div>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <div className={isLocked ? "opacity-30 pointer-events-none" : ""}><MenuButton onClick={() => setView('pos')} label="Ventas" icon="ShoppingCart" color={`bg-${tema}-600 text-white hover:bg-${tema}-700`}/></div>
                    <div className={isLocked ? "opacity-30 pointer-events-none" : ""}><MenuButton onClick={() => setView('purchase')} label="Compras" icon="Truck" color="bg-slate-800 text-white hover:bg-slate-700"/></div>
                    <div className={isLocked ? "opacity-30 pointer-events-none" : ""}><MenuButton onClick={() => setView('debts')} label="Cobranzas" icon="UserCheck" color="bg-orange-500 text-white hover:bg-orange-600"/></div>
                    <MenuButton onClick={() => setView('contacts')} label="Contactos" icon="Users" color="bg-indigo-600 text-white hover:bg-indigo-700"/>
                    <div className={isLocked ? "opacity-30 pointer-events-none" : ""}><MenuButton onClick={() => setView('expenses')} label="Gastos" icon="Receipt" color="bg-rose-500 text-white hover:bg-rose-600"/></div>
                    <MenuButton onClick={() => setView('inventory')} label="Stock" icon="Package" color="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50"/>
                    <MenuButton onClick={() => setView('close')} label={isLocked ? "Exportar" : "Cierre"} icon={isLocked ? "Download" : "Lock"} color="bg-amber-400 text-white hover:bg-amber-500"/>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <StatCard label="Usd" val={`$${stats.usd.toFixed(2)}`} icon="DollarSign" color={`text-${tema}-600`} bg="bg-white"/>
                    <StatCard label="Bs" val={`${stats.bsFisico.toFixed(2)}`} icon="Coins" color="text-blue-600" bg="bg-white"/>
                    <StatCard label="Bancos" val={`${stats.bancosFisico.toFixed(2)}`} icon="Landmark" color="text-indigo-600" bg="bg-white"/>
                    <StatCard label="Fiao" val={`$${stats.cxc.toFixed(2)}`} icon="Users" color="text-orange-600" bg="bg-orange-50"/>
                    <StatCard label="Gastos" val={`$${stats.gastos.toFixed(2)}`} icon="TrendingDown" color="text-rose-600" bg="bg-rose-50"/>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-sm uppercase text-slate-800 flex items-center gap-2"><Icon name="Award" size={16} className={`text-${tema}-600`}/> Top Vendidos</h3>
                        </div>
                        <div className="space-y-2 flex-1">
                            {topProducts.length === 0 ? <p className="text-xs text-slate-400 text-center font-bold py-4 uppercase">Sin datos este periodo</p> : topProducts.map((p, i) => (
                                <div key={i} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i===0 ? 'bg-amber-100 text-amber-600' : i===1 ? 'bg-slate-200 text-slate-600' : i===2 ? 'bg-orange-100 text-orange-600' : 'bg-white border border-slate-200 text-slate-400'}`}>{i+1}</span>
                                        <span className="font-black text-xs uppercase truncate max-w-[150px]">{p.name}</span>
                                    </div>
                                    <span className={`font-black text-${tema}-600 text-xs`}>{p.qty} unid</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-sm uppercase text-slate-800 flex items-center gap-2"><Icon name="AlertCircle" size={16} className="text-rose-600"/> Mayores Deudores</h3>
                        </div>
                        <div className="space-y-3 flex-1">
                            {topDebtors.length === 0 ? <p className="text-xs text-emerald-500 text-center font-bold py-4 uppercase">No hay cuentas fiao :)</p> : topDebtors.map((d, i) => (
                                <div key={i} className="flex justify-between items-center bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                                    <div className="flex flex-col">
                                        <span className="font-black text-xs uppercase text-slate-800 truncate max-w-[150px]">{d.name}</span>
                                        <span className="text-[10px] font-bold text-slate-400">Cliente</span>
                                    </div>
                                    <span className="font-black text-rose-600 text-lg">${d.total.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4 bg-white rounded-[3rem] shadow-sm border border-slate-100 p-8 flex flex-col h-[calc(100vh-5rem)] min-h-[600px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-lg uppercase text-slate-900">Actividad Reciente</h3>
                    <div className="p-3 bg-slate-50 rounded-2xl"><Icon name="List" size={20} className="text-slate-400"/></div>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-hide">
                    {recentActivity.length === 0 ? <p className="text-center text-slate-400 font-bold text-sm uppercase mt-10">Sin transacciones</p> : recentActivity.map((act, i) => (
                        <div key={i} className="flex gap-4 items-start relative">
                            {i !== recentActivity.length -1 && <div className="absolute left-6 top-10 bottom-[-24px] w-[2px] bg-slate-100"></div>}
                            
                            <div className={`p-3 rounded-2xl ${act.bg} ${act.color} flex-shrink-0 relative z-10`}>
                                <Icon name={act.icon} size={20} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                                <div className="flex justify-between items-baseline mb-1">
                                    <p className="font-black text-sm uppercase">{act.type}</p>
                                    <p className="text-[10px] font-bold text-slate-400 flex-shrink-0">{act.time}</p>
                                </div>
                                <p className="text-xs text-slate-500 font-bold leading-tight line-clamp-2">{act.desc}</p>
                                <div className="flex justify-between items-center mt-2">
                                    <p className="text-[9px] font-black text-slate-300 uppercase">{act.ref}</p>
                                    {act.amount > 0 && <p className={`text-xs font-black ${act.color}`}>${act.amount.toFixed(2)}</p>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const POSModule = ({ onBack }) => {
    const { currentUser, inventory, tasaBCV, addTransaction, contacts } = useContext(AppContext);
    const validClients = contacts.filter(c => c.type === 'cliente' || c.type === 'ambos');
    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const rifEmp = currentUser?.rif || RIF_EMPRESA;

    const [client, setClient] = useState({ name: '', id: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState([]);
    const [weightModal, setWeightModal] = useState({ isOpen: false, product: null, weight: '' });
    const [payments, setPayments] = useState({ usd: '', bs: '', banco: '', refBanco: '', fiao: '' });
    const [change, setChange] = useState({ usd: '', bs: '', banco: '', refBanco: '' });

    const filteredInventory = useMemo(() => {
        return inventory.filter(p => p.stock > 0 && p.name.includes(searchTerm.toUpperCase()));
    }, [inventory, searchTerm]);

    const totalUSD = cart.reduce((acc, c) => acc + (c.qty * c.sellPrice), 0);
    const totalBS = totalUSD * tasaBCV;

    const paidUSD = (parseFloat(payments.usd) || 0) + ((parseFloat(payments.bs) || 0) / tasaBCV) + ((parseFloat(payments.banco) || 0) / tasaBCV) + ((parseFloat(payments.fiao) || 0) / tasaBCV);
    const isOverpaid = paidUSD > totalUSD && totalUSD > 0;
    const pendingChangeUSD = Math.max(0, paidUSD - totalUSD);
    const pendingChangeBS = pendingChangeUSD * tasaBCV;
    const totalChangeGivenUSD = (parseFloat(change.usd) || 0) + ((parseFloat(change.bs) || 0) / tasaBCV) + ((parseFloat(change.banco) || 0) / tasaBCV);
    const isChangeBalanceOk = !isOverpaid || (isOverpaid && Math.abs(pendingChangeUSD - totalChangeGivenUSD) <= 0.05);
    const canProcess = client.name && client.id && cart.length > 0 && paidUSD >= totalUSD && isChangeBalanceOk;

    const handleProductClick = (prod) => {
        if (prod.unit === 'kg') setWeightModal({ isOpen: true, product: prod, weight: '' });
        else addToCart(prod, 1);
    };

    const addToCart = (prod, specificQty = null) => {
        const step = specificQty !== null ? specificQty : (prod.unit === 'kg' ? 0.100 : 1);
        const exists = cart.find(c => c.name === prod.name);
        
        if (exists) {
            if (exists.qty + step > prod.stock) return alert(`Stock insuficiente. Disponible: ${prod.stock.toFixed(3)}`);
            setCart(cart.map(c => c.name === prod.name ? { ...c, qty: c.qty + step } : c));
        } else {
            if (prod.stock < step) return alert(`Stock insuficiente. Disponible: ${prod.stock.toFixed(3)}`);
            setCart([...cart, { ...prod, qty: step }]);
        }
    };

    const updateQty = (name, val) => {
        const prod = inventory.find(p => p.name === name);
        let newVal = parseFloat(val); if (isNaN(newVal)) newVal = 0;
        newVal = Math.max(0, Math.min(prod.stock, newVal));
        if (newVal === 0) setCart(cart.filter(c => c.name !== name));
        else setCart(cart.map(c => c.name === name ? { ...c, qty: newVal } : c));
    };

    const generatePDF = (ref, date, time) => {
        if (!window.jspdf) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(14);
        doc.text(nombreEmp, 40, 10, { align: "center" });
        doc.setFontSize(10); doc.text(`RIF: ${rifEmp}`, 40, 15, { align: "center" });
        
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(`Fecha: ${date} ${time}`, 5, 25); doc.text(`Ticket: ${ref}`, 5, 29);
        doc.text(`Cliente: ${client.name}`, 5, 33); doc.text(`CI/RIF: ${client.id}`, 5, 37);
        doc.text(`Tasa BCV: ${tasaBCV.toFixed(2)} Bs/$`, 5, 41);

        doc.setLineWidth(0.5); doc.line(5, 44, 75, 44);

        let y = 49;
        doc.setFont("helvetica", "bold");
        doc.text("CANT", 5, y); doc.text("DESCRIPCIÓN", 20, y); doc.text("TOTAL", 65, y);
        y += 5; doc.setFont("helvetica", "normal");

        cart.forEach(item => {
            const cantStr = `${item.qty.toFixed(item.unit === 'kg' ? 3 : 0)}${item.unit === 'kg' ? 'kg' : 'u'}`;
            const lineTotal = (item.qty * item.sellPrice).toFixed(2);
            doc.text(cantStr, 5, y); doc.text(item.name.substring(0, 18), 20, y); doc.text(`$${lineTotal}`, 65, y);
            y += 5;
        });

        doc.line(5, y, 75, y); y += 5;
        doc.setFont("helvetica", "bold"); doc.setFontSize(12);
        doc.text("TOTAL A PAGAR:", 5, y); doc.text(`$${totalUSD.toFixed(2)}`, 55, y);
        y += 5; doc.text(`(Bs ${totalBS.toFixed(2)})`, 55, y);
        doc.save(`Ticket_${ref}.pdf`);
    };

    const handleVenta = () => {
        if (!canProcess) return;

        const date = new Date().toLocaleDateString(), time = new Date().toLocaleTimeString(), ref = `VTA-${Date.now().toString().slice(-4)}`;
        let rows = [];
        
        cart.forEach(item => {
            const conceptoVenta = `Venta de ${item.qty.toFixed(item.unit === 'kg' ? 3 : 0)} ${item.unit} de ${item.name} | Cliente: ${client.name}`;
            const conceptoCosto = `Costo Venta | Cant: ${item.qty.toFixed(3)} ${item.unit} de ${item.name}`;
            
            rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.VENTAS, Nombre: 'Ventas de Mercancía', Concepto: conceptoVenta, Debe: 0, Haber: item.qty * item.sellPrice, Unidad_Medida: item.unit, Tasa: tasaBCV, Ref: ref, Precio_Venta: item.sellPrice, Entidad: client.name.toUpperCase(), Cantidad: item.qty });
            rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.INVENTARIO, Nombre: 'Inventario de Mercancía', Concepto: conceptoCosto, Debe: 0, Haber: item.qty * item.cost, Unidad_Medida: item.unit, Tasa: tasaBCV, Ref: ref, Precio_Venta: item.sellPrice, Entidad: client.name.toUpperCase(), Cantidad: item.qty });
            rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.COSTO_VTA, Nombre: 'Costo de Ventas', Concepto: conceptoCosto, Debe: item.qty * item.cost, Haber: 0, Unidad_Medida: item.unit, Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase(), Cantidad: item.qty });
        });

        if (parseFloat(payments.usd) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CAJA_USD, Nombre: 'Caja Principal ($)', Concepto: `Cobro Venta ${ref} (Efectivo $)`, Debe: parseFloat(payments.usd), Haber: 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
        if (parseFloat(payments.bs) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CAJA_BS, Nombre: 'Caja Principal (Bs)', Concepto: `Cobro Venta ${ref} (Efectivo Bs)`, Debe: parseFloat(payments.bs) / tasaBCV, Haber: 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
        if (parseFloat(payments.banco) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.BANCOS, Nombre: 'Bancos Nacionales', Concepto: `Cobro Venta ${ref} (Ref: ${payments.refBanco})`, Debe: parseFloat(payments.banco) / tasaBCV, Haber: 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
        if (parseFloat(payments.fiao) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CXC, Nombre: 'Cuentas por Cobrar Clientes', Concepto: `Crédito Venta ${ref} | Cliente: ${client.name}`, Debe: parseFloat(payments.fiao) / tasaBCV, Haber: 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });

        if (isOverpaid) {
            if (parseFloat(change.usd) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CAJA_USD, Nombre: 'Caja Principal ($)', Concepto: `Vuelto Venta ${ref} (Efectivo $)`, Debe: 0, Haber: parseFloat(change.usd), Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
            if (parseFloat(change.bs) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CAJA_BS, Nombre: 'Caja Principal (Bs)', Concepto: `Vuelto Venta ${ref} (Efectivo Bs)`, Debe: 0, Haber: parseFloat(change.bs) / tasaBCV, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
            if (parseFloat(change.banco) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.BANCOS, Nombre: 'Bancos Nacionales', Concepto: `Vuelto Venta ${ref} (Ref: ${change.refBanco})`, Debe: 0, Haber: parseFloat(change.banco) / tasaBCV, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });
        }

        const dif = rows.reduce((acc, r) => acc + (parseFloat(r.Debe) || 0), 0) - rows.reduce((acc, r) => acc + (parseFloat(r.Haber) || 0), 0);
        if (Math.abs(dif) > 0.009) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.DIF_CAMB, Nombre: 'Diferencial Cambiario', Concepto: `Ajuste Redondeo en Venta ${ref}`, Debe: dif < 0 ? Math.abs(dif) : 0, Haber: dif > 0 ? dif : 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: client.name.toUpperCase() });

        generatePDF(ref, date, time);
        addTransaction(rows); 
        onBack();
    };

    return (
        <div className="relative">
             {weightModal.isOpen && weightModal.product && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in">
                    <div className="bg-white p-8 rounded-[3rem] shadow-2xl max-w-md w-full border-4 border-blue-500">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-3xl font-black uppercase text-slate-900">{weightModal.product.name}</h3>
                                <p className="text-sm font-bold text-slate-400 mt-1">Precio x Kg: ${weightModal.product.sellPrice.toFixed(2)}</p>
                            </div>
                            <div className="bg-blue-100 text-blue-600 px-3 py-1 rounded-xl font-black text-xs uppercase">Balanza</div>
                        </div>
                        
                        <div className="space-y-6 mb-8 bg-slate-50 p-6 rounded-3xl border-2 border-slate-200">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Ingrese Peso Exacto (Kg)</label>
                                <input type="number" step="0.001" autoFocus className="w-full text-center text-6xl font-black p-4 bg-transparent outline-none text-slate-900 placeholder-slate-300" placeholder="0.000" value={weightModal.weight} onChange={e => setWeightModal({...weightModal, weight: e.target.value})} />
                            </div>
                            <div className="border-t-2 border-dashed border-slate-200 pt-4 flex justify-between items-end">
                                <span className="text-xs font-black uppercase text-slate-400">Subtotal:</span>
                                <div className="text-right">
                                    <p className="text-3xl font-black text-emerald-500">${((parseFloat(weightModal.weight) || 0) * weightModal.product.sellPrice).toFixed(2)}</p>
                                    <p className="text-sm font-bold text-emerald-700">{(((parseFloat(weightModal.weight) || 0) * weightModal.product.sellPrice) * tasaBCV).toFixed(2)} Bs</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button onClick={() => setWeightModal({isOpen: false, product: null, weight: ''})} className="flex-1 py-4 rounded-2xl font-bold uppercase text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button onClick={() => { addToCart(weightModal.product, parseFloat(weightModal.weight) || 0); setWeightModal({isOpen: false, product: null, weight: ''}); }} className="flex-[2] py-4 rounded-2xl font-black uppercase bg-blue-600 text-white shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" disabled={!weightModal.weight || parseFloat(weightModal.weight) <= 0}>Añadir al Carrito</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in h-[90vh]">
                <div className="lg:col-span-7 flex flex-col space-y-4 h-full">
                    <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex gap-4 items-center">
                        <button onClick={onBack} className="p-3 hover:bg-slate-100 text-slate-500 rounded-xl transition-colors"><Icon name="ArrowLeft"/></button>
                        <div className="flex-1 relative">
                            <Icon name="Search" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                            <input type="text" placeholder="BUSCAR PRODUCTO O CÓDIGO..." className="w-full bg-slate-50 pl-12 pr-4 py-4 rounded-2xl font-black uppercase text-sm outline-none border-2 border-transparent focus:border-blue-500 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="text-right px-4 border-l border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Tasa BCV</p>
                            <p className="font-black text-blue-600">{tasaBCV} Bs/$</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 pb-10">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {filteredInventory.map(p => (
                                <button key={p.id} onClick={() => handleProductClick(p)} className="bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm hover:border-blue-500 text-left transition-all group flex flex-col justify-between h-36 relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 ${p.unit==='kg' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'} px-3 py-1 rounded-bl-xl font-black text-[10px] uppercase flex items-center gap-1`}>
                                        {p.unit === 'kg' && <Icon name="Scale" size={10} />}
                                        {p.stock.toFixed(p.unit === 'kg' ? 3 : 0)} {p.unit}
                                    </div>
                                    <p className="font-black uppercase text-sm text-slate-800 leading-tight pr-8 mt-2">{p.name}</p>
                                    <div>
                                        <p className="font-black text-xl text-slate-900">${p.sellPrice.toFixed(2)}</p>
                                        <p className="font-bold text-xs text-slate-400">{(p.sellPrice * tasaBCV).toFixed(2)} Bs</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-5 flex flex-col h-full space-y-4">
                    <div className="bg-slate-900 rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden h-full">
                        
                        <div className="p-6 bg-slate-800 border-b border-white/10 space-y-3">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-black uppercase italic text-xs text-blue-400">Datos del Cliente *</h3>
                                <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md font-black uppercase">Afiliados: {validClients.length}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 relative">
                                <div className="relative">
                                    <Icon name="Search" size={16} className="absolute left-3 top-3.5 text-white/40" />
                                    <input 
                                        placeholder="BUSCAR CÉDULA / RIF..." 
                                        className="w-full pl-10 p-3 bg-white/10 text-white placeholder-white/40 rounded-xl font-bold uppercase outline-none text-xs focus:bg-white/20 border border-transparent focus:border-blue-500 transition-all" 
                                        value={client.id} 
                                        onChange={e => {
                                            const valor = e.target.value.toUpperCase();
                                            setClient({...client, id: valor});
                                            const afiliado = validClients.find(c => c.id.includes(valor) && valor.length > 3);
                                            if (afiliado) setClient({ name: afiliado.name, id: afiliado.id });
                                        }} 
                                    />
                                </div>
                                <input 
                                    placeholder="NOMBRE CLIENTE" 
                                    className="p-3 bg-white/10 text-white placeholder-white/40 rounded-xl font-bold uppercase outline-none text-xs focus:bg-white/20 transition-all" 
                                    value={client.name} 
                                    onChange={e => setClient({...client, name: e.target.value.toUpperCase()})} 
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {cart.length === 0 && <div className="h-full flex flex-col items-center justify-center text-white/20"><Icon name="ShoppingCart" size={48}/><p className="mt-4 font-black text-sm uppercase">Carrito Vacío</p></div>}
                            {cart.map(item => (
                                <div key={item.id} className="flex items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl">
                                    <div className="flex-1">
                                        <p className="text-[11px] font-black text-white uppercase truncate">{item.name}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <button onClick={() => updateQty(item.name, item.qty - (item.unit === 'kg' ? 0.1 : 1))} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"><Icon name="Minus" size={14}/></button>
                                            <input type="number" className="bg-transparent font-black w-16 text-center text-white outline-none" value={item.unit === 'kg' ? item.qty.toFixed(3) : item.qty} step={item.unit === 'kg' ? "0.001" : "1"} onChange={e => updateQty(item.name, e.target.value)} />
                                            <button onClick={() => updateQty(item.name, item.qty + (item.unit === 'kg' ? 0.1 : 1))} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"><Icon name="Plus" size={14}/></button>
                                            <span className="text-[10px] font-black uppercase text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md">{item.unit}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-lg text-emerald-400">${(item.qty * item.sellPrice).toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-white p-6 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                            <div className="flex justify-between items-end mb-4">
                                <span className="text-xs font-black uppercase text-slate-400">Total a Cobrar</span>
                                <div className="text-right">
                                    <p className="text-4xl font-black italic tracking-tighter text-slate-900">${totalUSD.toFixed(2)}</p>
                                    <p className="text-sm font-bold text-blue-600">{totalBS.toFixed(2)} Bs</p>
                                </div>
                            </div>

                            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                                {isOverpaid && (
                                    <div className="bg-emerald-100 border-2 border-emerald-400 p-3 rounded-2xl blink-alert text-center">
                                        <p className="font-black text-emerald-700 uppercase text-xs">¡Devolver al Cliente!</p>
                                        <p className="font-black text-emerald-600 text-lg">${pendingChangeUSD.toFixed(2)} / {pendingChangeBS.toFixed(2)} Bs</p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center border-b pb-1">
                                        <p className="text-[10px] font-black uppercase text-slate-400">1. Matriz de Pagos</p>
                                        <p className="text-[10px] font-black text-blue-600">Pagado: ${paidUSD.toFixed(2)}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="relative"><span className="absolute left-3 top-3 text-slate-400 text-xs font-bold">$</span><input placeholder="Efectivo USD" type="number" className="w-full pl-7 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={payments.usd} onChange={e => setPayments({...payments, usd: e.target.value})} /></div>
                                        <div className="relative"><span className="absolute left-3 top-3 text-slate-400 text-xs font-bold">Bs</span><input placeholder="Efectivo BS" type="number" className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={payments.bs} onChange={e => setPayments({...payments, bs: e.target.value})} /></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1"><span className="absolute left-3 top-3 text-slate-400 text-xs font-bold">Bs</span><input placeholder="Banco/Pago Móvil" type="number" className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={payments.banco} onChange={e => setPayments({...payments, banco: e.target.value})} /></div>
                                        <input placeholder="N° Referencia *" type="text" className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none uppercase" value={payments.refBanco} onChange={e => setPayments({...payments, refBanco: e.target.value})} />
                                    </div>
                                    <div className="relative"><span className="absolute left-3 top-3 text-orange-400 text-xs font-bold">Bs</span><input placeholder="Crédito / Fiao" type="number" className="w-full pl-8 p-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm font-bold outline-none focus:border-orange-500" value={payments.fiao} onChange={e => setPayments({...payments, fiao: e.target.value})} /></div>
                                </div>

                                {isOverpaid && (
                                    <div className="space-y-2 bg-rose-50 p-4 rounded-2xl border border-rose-200 animate-in">
                                        <div className="flex justify-between items-center border-b border-rose-200 pb-1 mb-2">
                                            <p className="text-[10px] font-black uppercase text-rose-500">2. Registro de Salida (Vuelto)</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative"><span className="absolute left-3 top-3 text-rose-400 text-xs font-bold">$</span><input placeholder="Vuelto USD" type="number" className="w-full pl-7 p-3 bg-white border border-rose-200 rounded-xl text-sm font-bold outline-none focus:border-rose-500" value={change.usd} onChange={e => setChange({...change, usd: e.target.value})} /></div>
                                            <div className="relative"><span className="absolute left-3 top-3 text-rose-400 text-xs font-bold">Bs</span><input placeholder="Vuelto BS" type="number" className="w-full pl-8 p-3 bg-white border border-rose-200 rounded-xl text-sm font-bold outline-none focus:border-rose-500" value={change.bs} onChange={e => setChange({...change, bs: e.target.value})} /></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative"><span className="absolute left-3 top-3 text-rose-400 text-xs font-bold">Bs</span><input placeholder="Vuelto PM" type="number" className="w-full pl-8 p-3 bg-white border border-rose-200 rounded-xl text-sm font-bold outline-none focus:border-rose-500" value={change.banco} onChange={e => setChange({...change, banco: e.target.value})} /></div>
                                            <input placeholder="Ref PM *" type="text" className="flex-1 p-3 bg-white border border-rose-200 rounded-xl text-sm font-bold outline-none uppercase" value={change.refBanco} onChange={e => setChange({...change, refBanco: e.target.value})} />
                                        </div>
                                    </div>
                                )}

                                <button onClick={handleVenta} disabled={!canProcess} className={`w-full mt-4 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex justify-center items-center gap-2 ${canProcess ? 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                                    <Icon name="Printer" size={20}/> Procesar Venta
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ReceptionModule = ({ onBack }) => {
    const { currentUser, addTransaction, tasaBCV, contacts } = useContext(AppContext);
    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const rifEmp = currentUser?.rif || RIF_EMPRESA;
    
    const providers = contacts.filter(c => c.type === 'proveedor' || c.type === 'ambos');

    const [provider, setProvider] = useState({ name: '', rif: '' });
    const [cart, setCart] = useState([]);
    const [payments, setPayments] = useState({ usd: '', bs: '', banco: '', cxp: '' });
    const [item, setItem] = useState({ name: '', qty: '', unit: 'unidades', costTotal: '', sellPrice: '' });

    const addItem = () => {
        if (!item.name || !item.qty || !item.costTotal) return;
        setCart([...cart, { ...item, qty: parseFloat(item.qty), costTotal: parseFloat(item.costTotal), sellPrice: parseFloat(item.sellPrice), id: Date.now() }]);
        setItem({ name: '', qty: '', unit: 'unidades', costTotal: '', sellPrice: '' });
    };

    const total = cart.reduce((acc, c) => acc + c.costTotal, 0);

    const totalPagado = (parseFloat(payments.usd) || 0) + ((parseFloat(payments.bs) || 0) / tasaBCV) + ((parseFloat(payments.banco) || 0) / tasaBCV) + ((parseFloat(payments.cxp) || 0));
    const canProcessCompra = total > 0 && provider.name && Math.abs(total - totalPagado) < 0.05;

    const handleFinalizar = () => {
        if (!canProcessCompra) return;
        
        const date = new Date().toLocaleDateString(), time = new Date().toLocaleTimeString(), ref = `REC-${Date.now().toString().slice(-4)}`;
        let rows = [];
        
        cart.forEach(c => {
            const concepto = `Recepcion: ${c.name} | Cant: ${c.qty.toFixed(c.unit === 'kg' ? 3 : 0)} ${c.unit} | Prov: ${provider.name}`;
            rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.INVENTARIO, Nombre: 'Inventario de Mercancía', Concepto: concepto, Debe: c.costTotal, Haber: 0, Unidad_Medida: c.unit, Tasa: tasaBCV, Ref: ref, Precio_Venta: c.sellPrice, Entidad: provider.name.toUpperCase(), Cantidad: c.qty });
        });

        const pMap = [
            { k: 'usd', c: CTA.CAJA_USD, n: 'Caja Principal ($)' }, { k: 'bs', c: CTA.CAJA_BS, n: 'Caja Principal (Bs)' },
            { k: 'banco', c: CTA.BANCOS, n: 'Bancos Nacionales' }, { k: 'cxp', c: CTA.CXP, n: 'Proveedores por Pagar' }
        ];

        pMap.forEach(p => {
            if (parseFloat(payments[p.k]) > 0) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: p.c, Nombre: p.n, Concepto: `Pago Prov: ${provider.name} | Ref: ${ref}`, Debe: 0, Haber: parseFloat(payments[p.k]), Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: provider.name.toUpperCase() });
        });
        
        const dif = rows.reduce((acc, r) => acc + (parseFloat(r.Debe) || 0), 0) - rows.reduce((acc, r) => acc + (parseFloat(r.Haber) || 0), 0);
        if (Math.abs(dif) > 0.009) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.DIF_CAMB, Nombre: 'Diferencial Cambiario', Concepto: `Ajuste Redondeo en Compra ${ref}`, Debe: dif < 0 ? Math.abs(dif) : 0, Haber: dif > 0 ? dif : 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: provider.name.toUpperCase() });

        addTransaction(rows); onBack();
    };

    return (
        <div className="animate-in space-y-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl"><Icon name="ArrowLeft"/></button>
                <h2 className="font-black uppercase italic tracking-tighter text-xl">Recepción de Mercancía</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 grid grid-cols-2 gap-4">
                        <div className="relative">
                            <Icon name="Search" size={16} className="absolute left-4 top-5 text-slate-400" />
                            <input 
                                placeholder="BUSCAR RIF / CÉDULA..." 
                                className="w-full pl-10 p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none focus:border-blue-500 border-2 border-transparent transition-all" 
                                value={provider.rif} 
                                onChange={e => {
                                    const val = e.target.value.toUpperCase();
                                    setProvider({...provider, rif: val});
                                    const found = providers.find(p => p.id.includes(val) && val.length > 3);
                                    if(found) setProvider({ name: found.name, rif: found.id });
                                }} 
                            />
                        </div>
                        <div>
                            <input 
                                list="reception-providers"
                                placeholder="NOMBRE PROVEEDOR *" 
                                className="w-full p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none focus:border-blue-500 border-2 border-transparent transition-all" 
                                value={provider.name} 
                                onChange={e => {
                                    const val = e.target.value.toUpperCase();
                                    const found = providers.find(p => p.name === val);
                                    if(found) setProvider({ name: found.name, rif: found.id });
                                    else setProvider({...provider, name: val});
                                }} 
                            />
                            <datalist id="reception-providers">
                                {providers.map(p => <option key={p.id} value={p.name} />)}
                            </datalist>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <input placeholder="NOMBRE PRODUCTO" className="w-full p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none" value={item.name} onChange={e => setItem({...item, name: e.target.value.toUpperCase()})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Cant / Peso</label>
                                <input type="number" step={item.unit === 'kg' ? "0.001" : "1"} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={item.qty} onChange={e => setItem({...item, qty: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Unidad</label>
                                <select className="w-full p-4 bg-blue-50 text-blue-600 rounded-2xl font-black uppercase outline-none" value={item.unit} onChange={e => setItem({...item, unit: e.target.value})}>
                                    <option value="unidades">unidades</option>
                                    <option value="kg">kg</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Costo Total ($)</label>
                                <input type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={item.costTotal} onChange={e => setItem({...item, costTotal: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Precio Venta Sugerido ($)</label>
                                <input type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={item.sellPrice} onChange={e => setItem({...item, sellPrice: e.target.value})} />
                            </div>
                        </div>
                        <button onClick={addItem} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase italic shadow-lg hover:bg-black transition-all">Añadir a Recepción</button>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                        <table className="w-full text-xs font-bold">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400"><tr><th className="p-4 text-left">Item</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Costo Unit.</th><th className="p-4"></th></tr></thead>
                            <tbody className="divide-y divide-slate-50">
                                {cart.map(c => <tr key={c.id}><td className="p-4 uppercase">{c.name}</td><td className="p-4 text-center">{c.qty} {c.unit}</td><td className="p-4 text-right">${(c.costTotal / c.qty).toFixed(2)}</td><td className="p-4 text-center"><button onClick={() => setCart(cart.filter(item => item.id !== c.id))} className="text-rose-400 hover:text-rose-600"><Icon name="Trash2" size={16}/></button></td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-xl space-y-6">
                        <h3 className="font-black uppercase italic text-sm border-b border-white/10 pb-4 text-blue-400">Total Compra</h3>
                        <div className="text-right">
                            <p className="text-5xl font-black tracking-tighter italic">${total.toFixed(2)}</p>
                            <p className="text-blue-400 font-bold">{(total * tasaBCV).toFixed(2)} Bs</p>
                        </div>
                        <div className="space-y-3">
                            <input placeholder="Pago USD $" type="number" className="w-full p-4 bg-white/5 rounded-2xl text-center font-bold outline-none border border-white/10" value={payments.usd} onChange={e => setPayments({...payments, usd: e.target.value})} />
                            <input placeholder="Pago BS (Monto en Bolívares)" type="number" className="w-full p-4 bg-white/5 rounded-2xl text-center font-bold outline-none border border-white/10" value={payments.bs} onChange={e => setPayments({...payments, bs: e.target.value})} />
                            <input placeholder="BANCO (Monto en Bolívares)" type="number" className="w-full p-4 bg-white/5 rounded-2xl text-center font-bold outline-none border border-white/10" value={payments.banco} onChange={e => setPayments({...payments, banco: e.target.value})} />
                            <input placeholder="CRÉDITO CXP (Monto en Dolares)" type="number" className="w-full p-4 bg-orange-500/10 text-orange-400 rounded-2xl text-center font-bold outline-none border border-orange-500/20" value={payments.cxp} onChange={e => setPayments({...payments, cxp: e.target.value})} />
                        </div>
                        <button onClick={handleFinalizar} disabled={!canProcessCompra} className={`w-full py-6 rounded-[2rem] font-black uppercase italic shadow-lg transition-all ${canProcessCompra ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>Confirmar Compra</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DebtModule = ({ onBack }) => {
    const { currentUser, journal, addTransaction, tasaBCV } = useContext(AppContext);
    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const rifEmp = currentUser?.rif || RIF_EMPRESA;

    const [selectedClient, setSelectedClient] = useState(null);
    const [payModal, setPayModal] = useState(false);
    const [payData, setPayData] = useState({ usd: '', bs: '', banco: '', ref: '' });

    const clientBalances = useMemo(() => {
        const balances = {};
        journal.filter(t => String(t.Cuenta||'').trim() === CTA.CXC || String(t.Cuenta||'').toUpperCase().includes('COBRAR')).forEach(t => {
            const conceptoStr = String(t.Concepto || '');
            const cliente = conceptoStr.split('| Cliente: ')[1] || t.Entidad || "DESCONOCIDO";
            if (!balances[cliente]) balances[cliente] = { name: cliente, total: 0 };
            balances[cliente].total += (parseFloat(t.Debe) || 0) - (parseFloat(t.Haber) || 0);
        });
        return Object.values(balances).filter(b => b.total > 0.01);
    }, [journal]);

    const totalToPayUSD = (parseFloat(payData.usd) || 0) + ((parseFloat(payData.bs) || 0) / tasaBCV) + ((parseFloat(payData.banco) || 0) / tasaBCV);

    const generateReceiptPDF = (ref, clientName, amount, methods) => {
        if (!window.jspdf) return alert("El PDF no pudo generarse (falta librería jsPDF), pero el pago fue registrado.");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: [80, 150] });
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("RECIBO DE PAGO", 40, 10, { align: "center" });
        doc.setFontSize(8); doc.text(nombreEmp, 40, 15, { align: "center" });
        doc.line(5, 20, 75, 20); doc.text(`REF: ${ref}`, 5, 25); doc.text(`FECHA: ${new Date().toLocaleString()}`, 5, 29); doc.text(`CLIENTE: ${clientName}`, 5, 33);
        doc.line(5, 36, 75, 36); doc.setFontSize(10); doc.text("CONCEPTO: ABONO A CUENTA", 5, 42);
        doc.setFontSize(14); doc.text(`PAGADO: $${amount.toFixed(2)}`, 5, 52);
        doc.setFontSize(8); let y = 65; doc.text("DETALLE:", 5, y); y+=5;
        if (methods.usd > 0) { doc.text(`- Efectivo $: $${methods.usd}`, 10, y); y+=4; }
        if (methods.bs > 0) { doc.text(`- Efectivo Bs: Bs.${methods.bs}`, 10, y); y+=4; }
        if (methods.banco > 0) { doc.text(`- Banco: Bs.${methods.banco}`, 10, y); y+=4; }
        doc.save(`Recibo_${ref}.pdf`);
    };

    const handleProcessPayment = () => {
        if (totalToPayUSD <= 0) return;
        const ref = `RCP-${Date.now().toString().slice(-4)}`, date = new Date().toLocaleDateString(), time = new Date().toLocaleTimeString();
        let rows = [{ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.CXC, Nombre: 'Cuentas por Cobrar Clientes', Concepto: `Abono Deuda | Cliente: ${selectedClient.name}`, Debe: 0, Haber: totalToPayUSD, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: selectedClient.name.toUpperCase() }];
        
        if (parseFloat(payData.usd) > 0) rows.push({ ...rows[0], Cuenta: CTA.CAJA_USD, Nombre: 'Caja Principal ($)', Concepto: `Cobro a ${selectedClient.name}`, Debe: parseFloat(payData.usd), Haber: 0 });
        if (parseFloat(payData.bs) > 0) rows.push({ ...rows[0], Cuenta: CTA.CAJA_BS, Nombre: 'Caja Principal (Bs)', Concepto: `Cobro a ${selectedClient.name}`, Debe: parseFloat(payData.bs)/tasaBCV, Haber: 0 });
        if (parseFloat(payData.banco) > 0) rows.push({ ...rows[0], Cuenta: CTA.BANCOS, Nombre: 'Bancos Nacionales', Concepto: `Cobro a ${selectedClient.name} (Ref: ${payData.ref})`, Debe: parseFloat(payData.banco)/tasaBCV, Haber: 0 });
        
        addTransaction(rows); generateReceiptPDF(ref, selectedClient.name, totalToPayUSD, payData);
        setPayModal(false); setPayData({ usd: '', bs: '', banco: '', ref: '' }); setSelectedClient(null);
    };

    return (
        <div className="animate-in space-y-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl"><Icon name="ArrowLeft"/></button>
                <h2 className="font-black uppercase italic text-xl text-blue-600">Cobranzas (Clientes Fiao)</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {clientBalances.length === 0 ? <div className="col-span-full p-10 text-center font-bold text-slate-400 uppercase">Sin cuentas pendientes</div> : clientBalances.map(client => (
                    <div key={client.name} className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-sm text-center">
                        <h3 className="font-black text-lg text-slate-800 uppercase mb-4">{client.name}</h3>
                        <div className="bg-slate-50 p-4 rounded-2xl mb-4"><p className="text-[10px] font-black text-slate-400 uppercase">Saldo Pendiente</p><p className="text-3xl font-black text-rose-600">${client.total.toFixed(2)}</p></div>
                        <button onClick={() => { setSelectedClient(client); setPayModal(true); }} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:scale-[1.02] transition-transform">Registrar Pago</button>
                    </div>
                ))}
            </div>
            {payModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-[3rem] shadow-2xl max-w-sm w-full border-4 border-emerald-500">
                        <h3 className="text-xl font-black uppercase mb-6 text-center">Abono: {selectedClient?.name}</h3>
                        <div className="space-y-3 mb-6">
                            <input placeholder="Efectivo $" type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:border-emerald-500 border-2 border-transparent" value={payData.usd} onChange={e => setPayData({...payData, usd: e.target.value})} />
                            <input placeholder="Efectivo Bs" type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:border-emerald-500 border-2 border-transparent" value={payData.bs} onChange={e => setPayData({...payData, bs: e.target.value})} />
                            <div className="flex gap-2">
                                <input placeholder="Banco Bs" type="number" className="flex-1 p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:border-emerald-500 border-2 border-transparent" value={payData.banco} onChange={e => setPayData({...payData, banco: e.target.value})} />
                                <input placeholder="Ref" className="w-24 p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none focus:border-emerald-500 border-2 border-transparent" value={payData.ref} onChange={e => setPayData({...payData, ref: e.target.value})} />
                            </div>
                        </div>
                        <button onClick={handleProcessPayment} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase shadow-lg mb-2">Pagar y Generar Recibo</button>
                        <button onClick={() => setPayModal(false)} className="w-full py-4 font-bold text-slate-400 uppercase">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ExpensesModule = ({ onBack }) => {
    const { addTransaction, tasaBCV, journal, contacts, currentUser } = useContext(AppContext);
    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const rifEmp = currentUser?.rif || RIF_EMPRESA;
    
    const expenseAccounts = useMemo(() => {
        if (typeof window !== 'undefined' && window.CHART_OF_ACCOUNTS) {
            return Object.entries(window.CHART_OF_ACCOUNTS)
                .filter(([code, data]) => data.visibilidad && data.visibilidad.includes('expenses') && code.startsWith('6.'))
                .map(([code, data]) => ({ id: code, nombre: data.nombre }));
        }
        return [{ id: '6.1.01.01', nombre: 'Gastos Generales' }]; 
    }, []);

    const providers = contacts.filter(c => c.type === 'proveedor' || c.type === 'ambos');

    const [expense, setExpense] = useState({ beneficiarioId: '', beneficiario: '', categoria: expenseAccounts[0]?.id || '', concepto: '', monto: '' });
    const [payments, setPayments] = useState({ usd: '', bs: '', banco: '', cxp: '' });

    const recentExpenses = useMemo(() => journal.filter(r => String(r.Cuenta||'').startsWith('6.') && r.Debe > 0).slice(-5).reverse(), [journal]);

    const totalMonto = parseFloat(expense.monto) || 0;
    const totalPagado = (parseFloat(payments.usd) || 0) + ((parseFloat(payments.bs) || 0) / tasaBCV) + ((parseFloat(payments.banco) || 0) / tasaBCV) + ((parseFloat(payments.cxp) || 0) / tasaBCV);
    const canProcess = totalMonto > 0 && expense.beneficiario.trim() !== '' && expense.concepto.trim() !== '' && Math.abs(totalMonto - totalPagado) < 0.05;

    const handleRegistrarGasto = () => {
        if (!canProcess) return;

        const date = new Date().toLocaleDateString(), time = new Date().toLocaleTimeString(), ref = `GST-${Date.now().toString().slice(-4)}`;
        let rows = [];

        const accountName = expenseAccounts.find(a => a.id === expense.categoria)?.nombre || 'Gasto Operativo';
        const conceptoDetallado = `Pago a: ${expense.beneficiario} | Ref: ${ref} | ${expense.concepto}`;

        rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: expense.categoria, Nombre: accountName, Concepto: conceptoDetallado, Debe: totalMonto, Haber: 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: expense.beneficiario.toUpperCase() });

        const pMap = [
            { k: 'usd', c: CTA.CAJA_USD, n: 'Caja Principal ($)' }, { k: 'bs', c: CTA.CAJA_BS, n: 'Caja Principal (Bs)' },
            { k: 'banco', c: CTA.BANCOS, n: 'Bancos Nacionales' }, { k: 'cxp', c: CTA.CXP, n: 'Proveedores por Pagar' }
        ];

        pMap.forEach(p => {
            if (parseFloat(payments[p.k]) > 0) {
                const montoHaber = p.k === 'usd' ? parseFloat(payments[p.k]) : (parseFloat(payments[p.k]) / tasaBCV);
                rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: p.c, Nombre: p.n, Concepto: conceptoDetallado, Debe: 0, Haber: montoHaber, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: expense.beneficiario.toUpperCase() });
            }
        });

        const dif = rows.reduce((acc, r) => acc + (parseFloat(r.Debe) || 0), 0) - rows.reduce((acc, r) => acc + (parseFloat(r.Haber) || 0), 0);
        if (Math.abs(dif) > 0.009) rows.push({ Empresa: nombreEmp, RIF: rifEmp, Fecha: date, Hora: time, Cuenta: CTA.DIF_CAMB, Nombre: 'Diferencial Cambiario', Concepto: `Ajuste Redondeo en Gasto ${ref}`, Debe: dif < 0 ? Math.abs(dif) : 0, Haber: dif > 0 ? dif : 0, Unidad_Medida: 'monto', Tasa: tasaBCV, Ref: ref, Precio_Venta: 0, Entidad: expense.beneficiario.toUpperCase() });

        addTransaction(rows);
        setExpense({ beneficiarioId: '', beneficiario: '', categoria: expenseAccounts[0]?.id || '', concepto: '', monto: '' });
        setPayments({ usd: '', bs: '', banco: '', cxp: '' });
    };

    return (
        <div className="animate-in space-y-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><Icon name="ArrowLeft"/></button>
                <h2 className="font-black uppercase italic tracking-tighter text-xl text-rose-600">Registro de Gastos Operativos</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 flex flex-col space-y-6">
                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Buscar RIF / Cédula</label>
                                <Icon name="Search" size={16} className="absolute left-4 top-9 text-slate-400" />
                                <input placeholder="J-00000000" className="w-full pl-10 p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none focus:border-rose-300 border-2 border-transparent transition-all" value={expense.beneficiarioId} onChange={e => { const valor = e.target.value.toUpperCase(); setExpense({...expense, beneficiarioId: valor}); const found = providers.find(p => p.id.includes(valor) && valor.length > 3); if (found) setExpense(prev => ({...prev, beneficiario: found.name, beneficiarioId: found.id})); }} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nombre Proveedor *</label>
                                <input list="expense-providers" placeholder="Pedro Pérez, Corpoelec..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold uppercase outline-none focus:border-rose-300 border-2 border-transparent transition-all" value={expense.beneficiario} onChange={e => { const valor = e.target.value.toUpperCase(); const found = providers.find(p => p.name === valor); if (found) setExpense(prev => ({...prev, beneficiario: found.name, beneficiarioId: found.id})); else setExpense(prev => ({...prev, beneficiario: valor})); }} />
                                <datalist id="expense-providers">{providers.map(p => <option key={p.id} value={p.name} />)}</datalist>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Cuenta Contable (Gasto) *</label>
                                <select className="w-full p-4 bg-rose-50 text-rose-700 rounded-2xl font-black uppercase outline-none cursor-pointer text-sm" value={expense.categoria} onChange={e => setExpense({...expense, categoria: e.target.value})}>{expenseAccounts.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Concepto / Motivo *</label>
                                <input placeholder="Detalle del gasto..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:border-rose-300 border-2 border-transparent transition-all" value={expense.concepto} onChange={e => setExpense({...expense, concepto: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex-1">
                        <h3 className="text-xs font-black uppercase text-slate-400 mb-4 ml-2">Últimos Gastos Registrados</h3>
                        <div className="overflow-hidden rounded-2xl border border-slate-100">
                            <table className="w-full text-xs font-bold">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400"><tr><th className="p-3 text-left">Ref</th><th className="p-3 text-left">Cuenta</th><th className="p-3 text-left truncate max-w-[150px]">Concepto</th><th className="p-3 text-right">Monto</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">
                                    {recentExpenses.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate-400 italic">No hay gastos recientes</td></tr>}
                                    {recentExpenses.map((r, i) => <tr key={i} className="hover:bg-slate-50"><td className="p-3 text-slate-500">{r.Ref}</td><td className="p-3 uppercase text-rose-600">{r.Nombre}</td><td className="p-3 truncate max-w-[150px] text-slate-600" title={r.Concepto}>{r.Concepto}</td><td className="p-3 text-right font-black">${r.Debe.toFixed(2)}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-xl space-y-6">
                        <div className="space-y-1 border-b border-white/10 pb-6">
                            <label className="text-[10px] font-black uppercase text-rose-400">Monto Total del Gasto ($) *</label>
                            <input type="number" placeholder="0.00" className="w-full text-5xl font-black bg-transparent outline-none text-right italic tracking-tighter placeholder-white/20 text-rose-400" value={expense.monto} onChange={e => setExpense({...expense, monto: e.target.value})} />
                            <p className="text-right text-xs font-bold text-slate-400 mt-2">Equivalente: {(totalMonto * tasaBCV).toFixed(2)} Bs</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center"><p className="text-[10px] font-black uppercase text-white/40 italic">¿De dónde sale el dinero?</p><p className={`text-[10px] font-black ${Math.abs(totalMonto - totalPagado) > 0.05 ? 'text-rose-400' : 'text-emerald-400'}`}>Falta justificar: ${(totalMonto - totalPagado).toFixed(2)}</p></div>
                            <div className="relative"><span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">Caja $</span><input type="number" className="w-full pl-16 p-4 bg-white/5 rounded-2xl text-right font-bold outline-none border border-white/10 focus:border-rose-400 transition-colors" value={payments.usd} onChange={e => setPayments({...payments, usd: e.target.value})} /></div>
                            <div className="relative"><span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">Caja Bs</span><input type="number" className="w-full pl-16 p-4 bg-white/5 rounded-2xl text-right font-bold outline-none border border-white/10 focus:border-rose-400 transition-colors" value={payments.bs} onChange={e => setPayments({...payments, bs: e.target.value})} /></div>
                            <div className="relative"><span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">Banco Bs</span><input type="number" className="w-full pl-20 p-4 bg-white/5 rounded-2xl text-right font-bold outline-none border border-white/10 focus:border-rose-400 transition-colors" value={payments.banco} onChange={e => setPayments({...payments, banco: e.target.value})} /></div>
                            <div className="relative mt-4"><span className="absolute left-4 top-4 text-orange-400 text-xs font-bold">CxP (Crédito) Bs</span><input type="number" className="w-full pl-32 p-4 bg-orange-500/10 text-orange-400 rounded-2xl text-right font-bold outline-none border border-orange-500/20 focus:border-orange-400 transition-colors" value={payments.cxp} onChange={e => setPayments({...payments, cxp: e.target.value})} /></div>
                        </div>
                        <button onClick={handleRegistrarGasto} disabled={!canProcess} className={`w-full py-6 rounded-[2rem] font-black uppercase italic shadow-lg transition-all flex justify-center items-center gap-2 ${canProcess ? 'bg-rose-600 hover:bg-rose-700 text-white hover:-translate-y-1' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}><Icon name="Receipt" size={20}/> Registrar Salida</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ContactModule = ({ onBack }) => {
    const { contacts, setContacts } = useContext(AppContext);
    const [form, setForm] = useState({ id: '', name: '', email: '', phone: '', type: 'cliente' });

    const handleSave = (e) => {
        e.preventDefault();
        if (!form.id || !form.name) return alert("Cédula/RIF y Nombre son obligatorios");
        
        const existe = contacts.find(c => c.id === form.id);
        if (existe) return alert("Este contacto ya se encuentra registrado.");
        
        setContacts([...contacts, form]);
        setForm({ id: '', name: '', email: '', phone: '', type: 'cliente' });
        alert("¡Contacto afiliado con éxito!");
    };

    const handleExport = () => {
        if (contacts.length === 0) return alert("No hay contactos registrados.");
        const headers = ["Cedula_RIF", "Nombre_Completo", "Tipo", "Email", "Telefono"];
        const rows = contacts.map(c => [c.id, `"${c.name}"`, c.type.toUpperCase(), c.email, c.phone]);
        const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
        
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `Directorio_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    return (
        <div className="animate-in space-y-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><Icon name="ArrowLeft"/></button>
                    <h2 className="font-black uppercase italic tracking-tighter text-xl text-indigo-600">Gestión de Contactos</h2>
                </div>
                <button onClick={handleExport} className="bg-indigo-50 text-indigo-600 px-4 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-indigo-100 transition-all"><Icon name="Download" size={14}/> Exportar BD</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5">
                    <form onSubmit={handleSave} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-400 mb-6 flex items-center gap-2"><Icon name="UserPlus" size={14}/> Nuevo Registro</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Rol del Contacto *</label>
                                <select className="w-full p-4 bg-indigo-50 text-indigo-700 rounded-2xl font-black uppercase outline-none cursor-pointer text-sm border-2 border-transparent focus:border-indigo-500" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                                    <option value="cliente">Cliente (Para Ventas)</option>
                                    <option value="proveedor">Proveedor (Para Compras/Gastos)</option>
                                    <option value="ambos">Ambos (Cliente y Proveedor)</option>
                                </select>
                            </div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Cédula / RIF *</label><input required placeholder="Ej: V-12345678" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold uppercase focus:border-indigo-500 border-2 border-transparent" value={form.id} onChange={e => setForm({...form, id: e.target.value.toUpperCase()})} /></div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nombre / Razón Social *</label><input required placeholder="Nombre Completo" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold uppercase focus:border-indigo-500 border-2 border-transparent" value={form.name} onChange={e => setForm({...form, name: e.target.value.toUpperCase()})} /></div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Correo (Opcional)</label><input type="email" placeholder="contacto@correo.com" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold focus:border-indigo-500 border-2 border-transparent" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Teléfono / WhatsApp</label><input placeholder="0414-0000000" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold focus:border-indigo-500 border-2 border-transparent" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                        </div>
                        <button type="submit" className="w-full mt-4 py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase italic shadow-lg shadow-indigo-200 hover:scale-[1.02] transition-all">Guardar Contacto</button>
                    </form>
                </div>

                <div className="lg:col-span-7">
                    <div className="bg-slate-900 rounded-[3rem] p-8 text-white h-[600px] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-black uppercase text-slate-400 italic">Directorio General</h3><span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">Total: {contacts.length}</span></div>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {contacts.length === 0 && <div className="h-full flex items-center justify-center text-slate-600 font-bold text-sm uppercase"><p>Sin contactos registrados</p></div>}
                            {contacts.map((c, i) => (
                                <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${c.type === 'proveedor' ? 'bg-orange-500' : 'bg-indigo-500'}`}>{c.name.charAt(0)}</div>
                                        <div>
                                            <div className="flex items-center gap-2"><p className="font-black text-sm uppercase">{c.name}</p><span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${c.type === 'proveedor' ? 'bg-orange-500/20 text-orange-400' : c.type === 'ambos' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>{c.type}</span></div>
                                            <p className="text-[10px] text-slate-400 font-bold tracking-wider">{c.id} {c.phone && `• ${c.phone}`}</p>
                                        </div>
                                    </div>
                                    {c.email && <Icon name="Mail" size={16} className="text-slate-500"/>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InventoryModule = ({ onBack }) => {
    const { inventory } = useContext(AppContext);
    return (
        <div className="animate-in space-y-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl"><Icon name="ArrowLeft"/></button>
                <h2 className="font-black uppercase italic tracking-tighter text-xl">Stock Actual</h2>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                <table className="w-full text-sm font-bold">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400"><tr><th className="p-6 text-left">Producto</th><th className="p-6 text-center">Existencia</th><th className="p-6 text-center">Unidad</th><th className="p-6 text-right">Precio Venta</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                        {inventory.filter(p => p.stock > 0).map(p => (
                            <tr key={p.id}>
                                <td className="p-6 uppercase font-black">{p.name}</td>
                                <td className="p-6 text-center text-blue-600">{p.stock.toFixed(p.unit === 'kg' ? 3 : 0)}</td>
                                <td className="p-6 text-center uppercase text-[10px] text-slate-400">{p.unit}</td>
                                <td className="p-6 text-right font-black">${p.sellPrice.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const CashCloseModule = ({ onBack }) => {
    const { currentUser, setCurrentUser, journal, setJournal, tasaBCV, setTasaBCV, isLocked, setIsLocked, setIsInit } = useContext(AppContext);
    const [fisico, setFisico] = useState({ usd: '', bs: '', banco: '' });
    const [mostrarResultados, setMostrarResultados] = useState(false);
    
    const nombreEmp = currentUser?.nombreEmpresa || NOMBRE_EMPRESA;
    const tema = currentUser?.colorTema || 'blue';

    const sistema = useMemo(() => {
        const totales = { usd: 0, bs: 0, banco: 0 };
        journal.forEach(r => {
            const debe = parseFloat(r.Debe) || 0;
            const haber = parseFloat(r.Haber) || 0;
            const tasaH = parseFloat(r.Tasa) || tasaBCV;
            const cta = String(r.Cuenta || '').trim();

            if (cta === CTA.CAJA_USD || cta.includes('Divisa') || cta.includes('$')) totales.usd += (debe - haber);
            if (cta === CTA.CAJA_BS || cta.includes('Bolívar') || cta.includes('Bs')) totales.bs += (debe - haber) * tasaH;
            if (cta === CTA.BANCOS || cta.includes('Banco')) totales.banco += (debe - haber) * tasaH;
        });
        return totales;
    }, [journal, tasaBCV]);

    const handleExportExcel = () => {
        if (!window.XLSX) return alert("Error: La librería XLSX no está cargada en tu HTML.");

        const headers = ["Empresa", "RIF", "Fecha", "Cuenta", "Código", "Concepto", "Debe ($)", "Haber ($)", "Debe (Bs)", "Haber (Bs)", "Tasa", "Ref/Doc", "Cant.", "Unidad", "P. Venta", "Entidad"];

        const rows = (journal || []).map(entry => {
            const tasa = parseFloat(entry.Tasa) || tasaBCV || 1;
            const d$ = parseFloat(entry.Debe) || 0;
            const h$ = parseFloat(entry.Haber) || 0;
            
            let entidad = String(entry.Entidad || "GENERAL");
            const conceptoStr = String(entry.Concepto || '');

            if (entidad === "GENERAL" && conceptoStr) {
                if (conceptoStr.includes("Cliente:")) entidad = conceptoStr.split("Cliente:")[1].trim();
                else if (conceptoStr.includes("Pago a:")) entidad = conceptoStr.split("|")[0].replace("Pago a:", "").trim();
                else if (conceptoStr.includes("Prov:")) entidad = conceptoStr.split("Prov:")[1].trim();
            }

            let cantidad = parseFloat(entry.Cantidad) || 0;
            if (cantidad === 0 && conceptoStr.includes("Cant:")) {
                const cantMatch = conceptoStr.match(/Cant:\s*([\d.]+)/);
                if (cantMatch) cantidad = parseFloat(cantMatch[1]);
            }

            return [
                String(entry.Empresa || nombreEmp), String(entry.RIF || RIF_EMPRESA), String(entry.Fecha || ""), String(entry.Nombre || "Cuenta"), String(entry.Cuenta || "0.0.00"), conceptoStr, d$, h$, Number((d$ * tasa).toFixed(2)), Number((h$ * tasa).toFixed(2)), tasa, String(entry.Ref || ""), cantidad, String(entry.Unidad_Medida || "monto"), parseFloat(entry.Precio_Venta) || 0, entidad 
            ];
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [{wch: 25}, {wch: 15}, {wch: 12}, {wch: 20}, {wch: 12}, {wch: 40}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 12}, {wch: 25}];
        XLSX.utils.book_append_sheet(wb, ws, "Libro Diario 16C");
        XLSX.writeFile(wb, `Libro_Diario_${nombreEmp.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleCerrarTurno = () => {
        if (confirm("¿Confirmas el cierre del turno? El sistema se bloqueará y se descargará el respaldo Excel.")) {
            handleExportExcel();
            setIsLocked(true);
        }
    };

    const handleNuevoCiclo = () => {
        if (confirm("¿Deseas borrar TODOS los datos operativos (Libro Diario y Tasa) y volver a la pantalla de inicio?")) {
            if (confirm("ADVERTENCIA: Esta acción es irreversible. ¿Seguro que ya descargaste el Libro Diario en Excel?")) {
                setJournal([]); setTasaBCV(0); setIsLocked(false); setIsInit(false); 
                onBack(); 
                localStorage.removeItem('legaly_journal'); localStorage.removeItem('legaly_tasa'); localStorage.setItem('legaly_locked', 'false'); localStorage.setItem('legaly_init', 'false');
                alert("Ciclo cerrado con éxito. Tu base de datos de contactos se mantiene segura.");
            }
        }
    };

    const handleCerrarSesion = () => {
        if (confirm("¿Está seguro de cerrar la sesión de esta empresa? Deberá ingresar sus credenciales nuevamente.")) {
            setCurrentUser(null);
            setIsInit(false);
            localStorage.removeItem('legaly_init');
        }
    };

    const difUSD = (parseFloat(fisico.usd) || 0) - sistema.usd;
    const difBs = (parseFloat(fisico.bs) || 0) - sistema.bs;
    const difBanco = (parseFloat(fisico.banco) || 0) - sistema.banco;

    return (
        <div className="animate-in space-y-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><Icon name="ArrowLeft"/></button>
                    <h2 className="font-black uppercase italic tracking-tighter text-xl text-slate-800">Finalización de Ciclo</h2>
                </div>
                <button onClick={handleCerrarSesion} className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-4 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all border border-rose-200"><Icon name="LogOut" size={14}/> Cerrar Sesión</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                    <div className={`${isLocked ? 'opacity-40 pointer-events-none' : ''} bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 transition-opacity`}>
                        <h3 className="text-xs font-black uppercase text-slate-400 mb-6">1. Arqueo Físico de Caja</h3>
                        <div className="space-y-4">
                            <InputField label="Efectivo Dólares ($)" icon="DollarSign" color={`bg-${tema}-500`} value={fisico.usd} onChange={v => setFisico({...fisico, usd: v})} />
                            <InputField label="Efectivo Bolívares (Bs)" icon="Coins" color="bg-blue-600" value={fisico.bs} onChange={v => setFisico({...fisico, bs: v})} />
                            <InputField label="Portal Bancario (Bs)" icon="Landmark" color="bg-indigo-600" value={fisico.banco} onChange={v => setFisico({...fisico, banco: v})} />
                        </div>
                        {!mostrarResultados && <button onClick={() => setMostrarResultados(true)} className="w-full mt-6 py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-lg hover:bg-slate-800 transition-all">Comparar con Sistema</button>}
                    </div>

                    <div className="bg-rose-50 p-8 rounded-[3rem] border border-rose-100">
                        <div className="flex items-center gap-2 mb-4"><div className="bg-rose-600 text-white p-2 rounded-lg"><Icon name="Trash2" size={16}/></div><h3 className="text-xs font-black uppercase text-rose-600">Reinicio Maestro</h3></div>
                        <p className="text-xs text-rose-800/60 mb-6 font-medium leading-relaxed">Esta acción eliminará el Libro Diario actual y la tasa del día de la memoria. Su directorio de contactos está protegido y no será eliminado.</p>
                        <button onClick={handleNuevoCiclo} className="w-full py-5 bg-white border-2 border-rose-200 text-rose-600 rounded-2xl font-black uppercase text-xs hover:bg-rose-600 hover:text-white transition-all flex justify-center items-center gap-2 shadow-sm"><Icon name="RefreshCw" size={16}/> Iniciar Nuevo Ciclo Contable</button>
                    </div>
                </div>

                <div className="lg:col-span-5">
                    {mostrarResultados || isLocked ? (
                        <div className="bg-slate-900 rounded-[3rem] p-8 text-white shadow-2xl sticky top-4">
                            <h3 className="text-xs font-black uppercase text-slate-500 mb-8">Auditoría de Cierre</h3>
                            <div className="space-y-6">
                                <ResultRow label="Caja USD" system={sistema.usd} diff={difUSD} isUsd={true} />
                                <ResultRow label="Caja Bs" system={sistema.bs} diff={difBs} />
                                <ResultRow label="Banco Bs" system={sistema.banco} diff={difBanco} />
                            </div>

                            {!isLocked ? (
                                <button onClick={handleCerrarTurno} className="w-full mt-10 py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black uppercase italic transition-all flex justify-center items-center gap-3"><Icon name="FileDown" size={20}/> Cerrar Turno y Exportar (Excel)</button>
                            ) : (
                                <div className="mt-10 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl text-center">
                                    <p className="text-emerald-400 font-black uppercase text-[10px] tracking-widest">Turno Cerrado Correctamente</p>
                                    <p className="text-white/40 text-[10px] mt-2">Puede iniciar un nuevo ciclo o cerrar sesión.</p>
                                    <button onClick={handleExportExcel} className="mt-4 text-[10px] text-blue-400 font-bold uppercase underline">Descargar Excel Nuevamente</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 border-4 border-dashed border-slate-100 rounded-[3rem] text-slate-300"><Icon name="SearchCheck" size={48} className="mb-4 opacity-20"/><p className="font-bold text-xs uppercase tracking-tighter">Declare el efectivo para conciliar</p></div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ENRUTADOR PRINCIPAL Y RENDERIZADO
// ==========================================
const App = () => {
    const context = useContext(AppContext);
    if (!context) return <div className="p-10 text-rose-500 font-black text-xl">Error Crítico: AppProvider no envuelve a App.</div>;
    
    const { isInit, currentUser } = context;
    const [view, setView] = useState('dashboard');

    if (!currentUser) return <LoginScreen />;
    if (!isInit) return <StartScreen />;

    return (
        <div className="max-w-[1400px] mx-auto p-4 md:p-10 font-sans">
            {view === 'dashboard' && <Dashboard setView={setView} />}
            {view === 'pos' && <POSModule onBack={() => setView('dashboard')} />}
            {view === 'purchase' && <ReceptionModule onBack={() => setView('dashboard')} />}
            {view === 'debts' && <DebtModule onBack={() => setView('dashboard')} />}
            {view === 'expenses' && <ExpensesModule onBack={() => setView('dashboard')} />}
            {view === 'contacts' && <ContactModule onBack={() => setView('dashboard')} />}
            {view === 'inventory' && <InventoryModule onBack={() => setView('dashboard')} />}
            {view === 'close' && <CashCloseModule onBack={() => setView('dashboard')} />}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <AppProvider>
            <App />
        </AppProvider>
    );
}