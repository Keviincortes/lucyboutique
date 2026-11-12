/**
 * LUCY BOUTIQUE — Pedidos, inventario por talla, compras, gastos, facturas
 * ---------------------------------------------------------------------
 * El flujo de pedidos NO cambia: la landing sigue enviando {action:'create_order'}
 * y se sigue guardando la fila en la pestaña PEDIDOS con las mismas columnas.
 *
 * Lo nuevo:
 *   - INVENTARIO : stock por color y por talla (XS, S, M, L, XL)
 *   - MOVIMIENTOS: libro de entradas y salidas (inicial, compra, venta, ajuste)
 *   - GASTOS     : empaques, pauta, transporte, etc.
 *   - FACTURAS   : facturas de venta emitidas (con número consecutivo)
 *   - Dashboard  : un solo JSON con todo para pintar el panel
 *
 * Las acciones nuevas exigen la clave PANEL_KEY (propiedad del script).
 */

const SHEET_PEDIDOS='PEDIDOS';
const SHEET_INVENTARIO='INVENTARIO';
const SHEET_MOVIMIENTOS='MOVIMIENTOS';
const SHEET_GASTOS='GASTOS';
const SHEET_FACTURAS='FACTURAS';
const SHEET_PRODUCTOS='PRODUCTOS';

const COLORES=['Rosa','Negro','Blanco','Gris','Café','Chocolate'];
const TALLAS=['S','M','L','XL'];
const PRODUCTO_PEDIDO='Conjunto Poly Like';
const PRODUCTOS_INICIAL=[['Conjunto Poly Like','Sí'],['Promo 2 Conjuntos Poly Like','Sí']];
const CATEGORIAS_GASTO=['Empaque','Pauta publicitaria','Transporte y gasolina','Impuestos y comisiones','Otros'];
const ESTADOS_PEDIDO=['PENDIENTE COMPROBANTE','PAGADO','CONTRAENTREGA ENVIADO','ENTREGADO','CANCELADO'];
const ESTADOS_FACTURA=['pendiente','pagada','anulada'];

const HEADERS=['Fecha','Referencia','Estado','Nombre','Cédula','Celular','Correo','Ciudad','Dirección exacta','Barrio','Apartamento o casa','Cantidad de sets','Detalle de cada sudadera','Valor de las sudaderas','Valor del envío','Valor pagado hoy','Forma de pago','Regalo','Comprobante','Notas'];
const HEADERS_INV=['Producto','Color','Talla','Stock (sets)','Costo unitario promedio','Valor en inventario','Total del color','Última entrada','Actualizado'];
const HEADERS_MOV=['Fecha','Tipo','Producto','Color','Talla','Cantidad','Costo unitario','Total','Detalle','Referencia'];
const HEADERS_GAS=['Fecha','Categoría','Descripción','Monto','Notas'];
const HEADERS_FAC=['Número','Fecha','Referencia del pedido','Clienta','Celular','Ciudad','Detalle','Total','Estado','Notas'];
const HEADERS_PROD=['Nombre','Activo'];

/* ============================ ENTRADAS ============================ */

function doGet(e){
  try{
    const param=(e&&e.parameter)||{};
    const action=param.action||'';
    if(action==='dashboard'){
      assertKey_(param.key);
      return json_(dashboard_());
    }
    return json_({ok:true,service:'Lucy Boutique pedidos'});
  }catch(error){return json_({ok:false,error:error.message})}
}

function doPost(e){
  try{
    const raw=JSON.parse(e.postData.contents||'{}');
    const action=raw.action||'';
    if(action==='create_order')return crearPedido_(raw);
    if(action==='save_movement'){assertKey_(raw.key);return guardarMovimiento_(raw)}
    if(action==='save_expense'){assertKey_(raw.key);return guardarGasto_(raw)}
    if(action==='set_order_status'){assertKey_(raw.key);return cambiarEstado_(raw)}
    if(action==='delete_expense'){assertKey_(raw.key);return borrarGasto_(raw)}
    if(action==='delete_movement'){assertKey_(raw.key);return borrarMovimiento_(raw)}
    if(action==='save_invoice'){assertKey_(raw.key);return guardarFactura_(raw)}
    if(action==='save_invoice_manual'){assertKey_(raw.key);return guardarFacturaManual_(raw)}
    if(action==='save_product'){assertKey_(raw.key);return guardarProducto_(raw)}
    if(action==='delete_invoice'){assertKey_(raw.key);return borrarFactura_(raw)}
    return json_({ok:false,error:'Acción inválida'});
  }catch(error){return json_({ok:false,error:error.message})}
}

/* ============================ PEDIDOS ============================ */

function crearPedido_(raw){
  const o=normalizeOrder_(raw);
  validate_(o);
  reconcileTotals_(o);
  const sheet=getSheet_(SHEET_PEDIDOS);
  ensureHeaders_(sheet,HEADERS);
  const detail=o.items.map(function(item,index){return 'Sudadera '+(index+1)+' | Producto: Set chaqueta + pantalón | Color: '+item.color+' | Talla: '+item.size}).join(' || ');
  const paymentLabel=o.paymentMode==='advance'?'Pago anticipado':'Contraentrega — envío pagado';
  const values={
    'Fecha':new Date(),'Referencia':o.reference,'Estado':'PENDIENTE COMPROBANTE',
    'Nombre':o.customer.name,'Cédula':o.customer.idNumber,'Celular':o.customer.phone,
    'Correo':o.customer.email,'Ciudad':o.customer.city,'Dirección exacta':o.customer.address,
    'Barrio':o.customer.neighborhood,'Apartamento o casa':o.customer.unit,
    'Cantidad de sets':o.quantity,'Detalle de cada sudadera':detail,
    'Valor de las sudaderas':o.productTotal,'Valor del envío':o.shipping,
    'Valor pagado hoy':o.amountToPay,'Forma de pago':paymentLabel,
    'Regalo':o.gift?'Sí — pago anticipado':'No — contraentrega',
    'Comprobante':'Pendiente por WhatsApp','Notas':''
  };
  sheet.appendRow(HEADERS.map(function(header){return values[header]!==undefined?values[header]:''}));
  sendEmail_(o,detail,paymentLabel);
  // El inventario se descuenta DESPUÉS de guardar el pedido: si algo falla
  // aquí, el pedido sigue guardado y no se pierde la venta.
  try{descontarInventario_(o)}catch(invError){console.error('inventario',invError&&invError.message)}
  return json_({ok:true,reference:o.reference});
}

function normalizeOrder_(raw){
  const source=raw.customer||raw;
  const items=Array.isArray(raw.items)?raw.items:[];
  return {
    reference:raw.reference||raw.orderNumber||('LUCY-'+new Date().getTime()),
    customer:{name:source.name||source.fullName||raw.name||'',idNumber:source.idNumber||source.cedula||raw.idNumber||'',phone:source.phone||source.celular||raw.phone||'',email:source.email||raw.email||'',city:source.city||raw.city||'',address:source.address||source.addressLine||raw.address||'',neighborhood:source.neighborhood||source.barrio||raw.neighborhood||'',unit:source.unit||source.apartment||source.apartmentCasa||raw.unit||''},
    items:items,
    quantity:raw.quantity||items.length,
    productTotal:Number(raw.productTotal||raw.product||0),
    shipping:Number(raw.shipping||raw.shippingCost||0),
    amountToPay:Number(raw.amountToPay||raw.total||0),
    paymentMode:raw.paymentMode||raw.payment||'advance',
    gift:Boolean(raw.gift)
  };
}

function validate_(o){
  if(!o.reference||!o.customer.name||!o.customer.phone||!o.customer.city||!o.customer.address||!o.customer.neighborhood||!o.customer.unit)throw new Error('Faltan datos obligatorios');
  if(!Array.isArray(o.items)||o.items.length<1||o.items.length>2)throw new Error('Cantidad inválida');
  o.items.forEach(function(item){if(!item.color||!item.size)throw new Error('Cada sudadera necesita color y talla')});
}

function cityKey_(value){return String(value||'').toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}

function reconcileTotals_(o){
  o.quantity=o.items.length;
  o.productTotal=o.quantity===2?129900:69900;
  o.shipping=['bogota','bogota dc','bogota d.c.','bta'].indexOf(cityKey_(o.customer.city))>=0?10000:22900;
  o.paymentMode=o.paymentMode==='reserve'?'reserve':'advance';
  o.amountToPay=o.paymentMode==='advance'?o.productTotal+o.shipping:o.shipping;
  o.gift=o.paymentMode==='advance';
}

/* ========================== INVENTARIO ========================== */

function descontarInventario_(o){
  const state=estadoInventario_();
  const sheet=getSheet_(SHEET_MOVIMIENTOS);
  ensureHeaders_(sheet,HEADERS_MOV);
  const now=new Date();
  const rows=[];
  const producto=PRODUCTO_PEDIDO;
  o.items.forEach(function(item,index){
    const color=colorCanonica_(item.color);
    const talla=tallaCanonica_(item.size);
    const porTalla=state.tallas[producto+'|'+color+'|'+talla];
    const porColor=state.colores[producto+'|'+color];
    let promedio=0;
    if(porTalla&&porTalla.entradas>0)promedio=porTalla.costoTotal/porTalla.entradas;
    else if(porColor&&porColor.entradas>0)promedio=porColor.costoTotal/porColor.entradas;
    rows.push([now,'PEDIDO',producto,color,talla,1,promedio,promedio,'Venta '+o.reference+' · Set '+(index+1)+(talla?' · Talla '+talla:''),o.reference]);
  });
  if(rows.length)sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS_MOV.length).setValues(rows);
  actualizarHojaInventario_();
}

function guardarMovimiento_(raw){
  const tipo=String(raw.tipo||'COMPRA').toUpperCase();
  if(['INICIAL','COMPRA','AJUSTE','DEVOLUCION'].indexOf(tipo)<0)throw new Error('Tipo no válido');
  const producto=productoCanonica_(raw.producto);
  const color=colorCanonica_(raw.color);
  const costo=Number(raw.costoUnitario)||0;
  const detalle=raw.detalle||'';
  const referencia=raw.referencia||'';
  const sheet=getSheet_(SHEET_MOVIMIENTOS);
  ensureHeaders_(sheet,HEADERS_MOV);
  const now=new Date();
  const rows=[];

  const tallas=raw.tallas&&typeof raw.tallas==='object'?raw.tallas:null;
  if(tallas){
    let suma=0;
    Object.keys(tallas).forEach(function(t){suma+=Number(tallas[t])||0});
    const total=Number(raw.cantidad)||suma;
    if(suma&&total&&suma!==total)throw new Error('El desglose por talla no suma la cantidad');
    Object.keys(tallas).forEach(function(t){
      const q=Number(tallas[t])||0;
      if(!q)return;
      rows.push([now,tipo,producto,color,tallaCanonica_(t),q,costo,q*costo,detalle,referencia]);
    });
    if(!rows.length&&total)rows.push([now,tipo,producto,color,'',total,costo,total*costo,detalle,referencia]);
    if(!rows.length)throw new Error('Cantidad inválida');
  }else{
    const cantidad=Number(raw.cantidad)||0;
    if(!cantidad)throw new Error('Cantidad inválida');
    rows.push([now,tipo,producto,color,tallaCanonica_(raw.talla),cantidad,costo,cantidad*costo,detalle,referencia]);
  }

  sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS_MOV.length).setValues(rows);
  actualizarHojaInventario_();
  return json_({ok:true});
}

function borrarMovimiento_(raw){
  const fila=Number(raw.fila)||0;
  const sheet=getSheet_(SHEET_MOVIMIENTOS);
  if(fila<2||fila>sheet.getLastRow())throw new Error('Fila inválida');
  sheet.deleteRow(fila);
  actualizarHojaInventario_();
  return json_({ok:true});
}

function actualizarHojaInventario_(){
  const state=estadoInventario_();
  const sheet=getSheet_(SHEET_INVENTARIO);
  ensureHeaders_(sheet,HEADERS_INV);
  const rows=[];
  const productos=Object.keys(state.colores).map(function(k){return state.colores[k].producto});
  uniq_(productos).forEach(function(producto){
    COLORES.forEach(function(color){
      const colorInfo=state.colores[producto+'|'+color]||{stock:0,entradas:0,costoTotal:0};
      const promColor=colorInfo.entradas>0?colorInfo.costoTotal/colorInfo.entradas:0;
      const totalColor=colorInfo.stock;
      TALLAS.forEach(function(talla){
        const it=state.tallas[producto+'|'+color+'|'+talla];
        if(!it)return;
        rows.push([producto,color,talla,it.stock,it.entradas>0?it.costoTotal/it.entradas:0,it.stock*(it.entradas>0?it.costoTotal/it.entradas:0),totalColor,it.ultimaEntrada||'',new Date()]);
      });
      const libre=state.tallas[producto+'|'+color+'|'];
      if(libre&&(libre.stock||libre.entradas||libre.salidas)){
        rows.push([producto,color,'Sin desglose',libre.stock,libre.entradas>0?libre.costoTotal/libre.entradas:0,libre.stock*(libre.entradas>0?libre.costoTotal/libre.entradas:0),totalColor,libre.ultimaEntrada||'',new Date()]);
      }
    });
  });
  if(!rows.length)rows.push(['','','','','','','','',new Date()]);
  sheet.getRange(2,1,rows.length,HEADERS_INV.length).setValues(rows);
  const sobrantes=sheet.getLastRow()-(1+rows.length);
  if(sobrantes>0)sheet.getRange(2+rows.length,1,sobrantes,HEADERS_INV.length).clearContent();
}

function estadoInventario_(){
  const movs=leerMovimientos_();
  const tallas={};
  const colores={};
  function nuevoColor_(producto,color){
    return {producto:producto,color:color,stock:0,entradas:0,costoTotal:0,salidas:0,costeVendido:0,ultimaEntrada:'',tsUltima:0,tallas:{}};
  }
  function nuevaTalla_(producto,color,talla){
    return {producto:producto,color:color,talla:talla,stock:0,entradas:0,costoTotal:0,salidas:0,costeVendido:0,ultimaEntrada:'',tsUltima:0};
  }

  movs.forEach(function(m){
    const pk=m.producto+'|'+m.color;
    if(!colores[pk])colores[pk]=nuevoColor_(m.producto,m.color);
    const c=colores[pk];
    const k=m.producto+'|'+m.color+'|'+(m.talla||'');
    if(!tallas[k])tallas[k]=nuevaTalla_(m.producto,m.color,m.talla||'');
    const it=tallas[k];
    if(m.tipo==='PEDIDO'){
      c.stock-=m.cantidad;c.salidas+=m.cantidad;c.costeVendido+=m.total;
      it.stock-=m.cantidad;it.salidas+=m.cantidad;it.costeVendido+=m.total;
    }else{
      c.stock+=m.cantidad;c.entradas+=m.cantidad;c.costoTotal+=m.costoUnitario*m.cantidad;
      it.stock+=m.cantidad;it.entradas+=m.cantidad;it.costoTotal+=m.costoUnitario*m.cantidad;
      if(!c.ultimaEntrada||m.ts>c.tsUltima){c.ultimaEntrada=m.fecha;c.tsUltima=m.ts}
      if(!it.ultimaEntrada||m.ts>it.tsUltima){it.ultimaEntrada=m.fecha;it.tsUltima=m.ts}
    }
  });

  Object.keys(colores).forEach(function(pk){
    const c=colores[pk];
    TALLAS.forEach(function(talla){
      const it=tallas[c.producto+'|'+c.color+'|'+talla];
      c.tallas[talla]=it?it.stock:0;
    });
  });
  return {tallas:tallas,colores:colores};
}

function uniq_(arr){
  const seen={},out=[];
  arr.forEach(function(v){if(!seen[v]){seen[v]=1;out.push(v)}});
  return out;
}

/* ========================== PRODUCTOS ========================== */

function asegurarProductos_(){
  const sheet=getSheet_(SHEET_PRODUCTOS);
  ensureHeaders_(sheet,HEADERS_PROD);
  if(sheet.getLastRow()<2){
    sheet.getRange(2,1,PRODUCTOS_INICIAL.length,2).setValues(PRODUCTOS_INICIAL);
  }
  return sheet;
}

function guardarProducto_(raw){
  const nombre=String(raw.nombre||'').trim();
  if(!nombre)throw new Error('Falta el nombre del producto');
  const sheet=asegurarProductos_();
  const last=sheet.getLastRow();
  for(let i=2;i<=last;i++){
    if(normaliza_(sheet.getRange(i,1).getValue())===normaliza_(nombre)){
      sheet.getRange(i,2).setValue('Sí');
      return json_({ok:true,nombre:nombre,existia:true});
    }
  }
  sheet.appendRow([nombre,'Sí']);
  return json_({ok:true,nombre:nombre,existia:false});
}

function listarProductos_(){
  const sheet=asegurarProductos_();
  const last=sheet.getLastRow();
  const out=[];
  for(let i=2;i<=last;i++){
    const n=String(sheet.getRange(i,1).getValue()||'').trim();
    if(n)out.push({nombre:n,activo:String(sheet.getRange(i,2).getValue()||'Sí')!=='No'});
  }
  return out.length?out:PRODUCTOS_INICIAL.map(function(p){return {nombre:p[0],activo:true}});
}

/* ============================ GASTOS ============================ */

function guardarGasto_(raw){
  const monto=Number(raw.monto)||0;
  if(!monto)throw new Error('Monto inválido');
  const sheet=getSheet_(SHEET_GASTOS);
  ensureHeaders_(sheet,HEADERS_GAS);
  sheet.appendRow([new Date(),raw.categoria||'Otros',raw.descripcion||'',monto,raw.notas||'']);
  return json_({ok:true});
}

function borrarGasto_(raw){
  const fila=Number(raw.fila)||0;
  const sheet=getSheet_(SHEET_GASTOS);
  if(fila<2||fila>sheet.getLastRow())throw new Error('Fila inválida');
  sheet.deleteRow(fila);
  return json_({ok:true});
}

/* =========================== FACTURAS =========================== */

function guardarFactura_(raw){
  const ref=String(raw.referencia||'').trim();
  if(!ref)throw new Error('Falta la referencia del pedido');
  const sheet=getSheet_(SHEET_FACTURAS);
  ensureHeaders_(sheet,HEADERS_FAC);
  const last=sheet.getLastRow();
  let consecutivo=1;
  for(let i=2;i<=last;i++){
    const num=String(sheet.getRange(i,1).getValue()||'');
    const m=/(\d+)\s*$/.exec(num);
    if(m)consecutivo=Math.max(consecutivo,Number(m[1])+1);
  }
  const numero='LB-'+('000'+consecutivo).slice(-4);
  const estado=ESTADOS_FACTURA.indexOf(String(raw.estado||'').toLowerCase())>=0?String(raw.estado).toLowerCase():'pendiente';
  sheet.appendRow([numero,new Date(),ref,raw.clienta||'',raw.celular||'',raw.ciudad||'',raw.detalle||'',Number(raw.total)||0,estado,raw.notas||'']);
  return json_({ok:true,numero:numero});
}

function guardarFacturaManual_(raw){
  const sheet=getSheet_(SHEET_FACTURAS);
  ensureHeaders_(sheet,HEADERS_FAC);
  const last=sheet.getLastRow();
  let consecutivo=1;
  for(let i=2;i<=last;i++){
    const num=String(sheet.getRange(i,1).getValue()||'');
    const m=/(\d+)\s*$/.exec(num);
    if(m)consecutivo=Math.max(consecutivo,Number(m[1])+1);
  }
  const numero='LB-'+('000'+consecutivo).slice(-4);
  const total=Number(raw.total)||0;
  if(!total)throw new Error('El total no puede quedar en cero');
  if(!raw.clienta)throw new Error('Falta el nombre de la clienta');
  const estado=ESTADOS_FACTURA.indexOf(String(raw.estado||'').toLowerCase())>=0?String(raw.estado).toLowerCase():'pagada';
  const ref='MANUAL-'+numero;
  sheet.appendRow([numero,new Date(),ref,raw.clienta||'',raw.celular||'',raw.ciudad||'',raw.detalle||'',total,estado,raw.notas||'']);
  return json_({ok:true,numero:numero,referencia:ref});
}

function borrarFactura_(raw){
  const fila=Number(raw.fila)||0;
  const sheet=getSheet_(SHEET_FACTURAS);
  if(fila<2||fila>sheet.getLastRow())throw new Error('Fila inválida');
  sheet.deleteRow(fila);
  return json_({ok:true});
}

/* ========================== PEDIDOS ========================== */

function cambiarEstado_(raw){
  const referencia=String(raw.referencia||'').trim();
  const estado=String(raw.estado||'').trim();
  if(!referencia||!estado)throw new Error('Falta la referencia o el estado');
  const sheet=getSheet_(SHEET_PEDIDOS);
  const last=sheet.getLastRow();
  if(last<2)throw new Error('Todavía no hay pedidos');
  const refs=sheet.getRange(2,2,last-1,1).getValues();
  for(let i=0;i<refs.length;i++){
    if(String(refs[i][0]).trim()===referencia){
      sheet.getRange(i+2,3).setValue(estado);
      return json_({ok:true,referencia:referencia,estado:estado});
    }
  }
  throw new Error('Pedido no encontrado');
}

/* ========================== DASHBOARD ========================== */

function dashboard_(){
  const state=estadoInventario_();
  const movs=leerMovimientos_();
  const productos=listarProductos_();

  const inventario=[];
  const porProducto={};
  Object.keys(state.colores).forEach(function(pk){
    const c=state.colores[pk];
    if(!porProducto[c.producto])porProducto[c.producto]={producto:c.producto,colores:{}};
    porProducto[c.producto].colores[c.color]=c;
    TALLAS.forEach(function(talla){
      const it=state.tallas[c.producto+'|'+c.color+'|'+talla];
      if(!it)return;
      const prom=it.entradas>0?it.costoTotal/it.entradas:0;
      inventario.push({producto:c.producto,color:c.color,talla:talla,stock:it.stock,entradas:it.entradas,salidas:it.salidas,
        costoUnitario:Math.round(prom),valor:Math.round(it.stock*prom),
        ultimaEntrada:it.ultimaEntrada||'',alerta:alerta_(it.stock)});
    });
    const libre=state.tallas[c.producto+'|'+c.color+'|'];
    if(libre&&(libre.stock||libre.entradas||libre.salidas)){
      const prom=libre.entradas>0?libre.costoTotal/libre.entradas:0;
      inventario.push({producto:c.producto,color:c.color,talla:'',stock:libre.stock,entradas:libre.entradas,salidas:libre.salidas,
        costoUnitario:Math.round(prom),valor:Math.round(libre.stock*prom),
        ultimaEntrada:libre.ultimaEntrada||'',alerta:alerta_(libre.stock)});
    }
  });

  const inventarioColor=[];
  Object.keys(porProducto).forEach(function(pn){
    const po=porProducto[pn];
    COLORES.forEach(function(color){
      const c=po.colores[color];
      if(!c)return;
      const prom=c.entradas>0?c.costoTotal/c.entradas:0;
      inventarioColor.push({producto:pn,color:color,stock:c.stock,entradas:c.entradas,salidas:c.salidas,
        costoUnitario:Math.round(prom),valor:Math.round(c.stock*prom),
        ultimaEntrada:c.ultimaEntrada||'',alerta:alerta_(c.stock),
        tallas:c.tallas||{},sinDesglose:(state.tallas[pn+'|'+color+'|']||{}).stock||0});
    });
  });

  const ventasPorColor={};
  movs.forEach(function(m){
    if(m.tipo!=='PEDIDO')return;
    const k=m.color+'|'+(m.talla||'');
    if(!ventasPorColor[k])ventasPorColor[k]={color:m.color,talla:m.talla||'',vendidas:0};
    ventasPorColor[k].vendidas+=m.cantidad;
  });

  const gastos=leerFilas_(SHEET_GASTOS,HEADERS_GAS).map(function(r,i){
    return {fila:i+2,fecha:fechaTexto_(r[0]),ts:epoch_(r[0]),categoria:r[1]||'Otros',descripcion:r[2]||'',monto:Number(r[3])||0,notas:r[4]||''};
  });
  const gastosPorCategoria={};
  let totalGastos=0;
  gastos.forEach(function(g){
    totalGastos+=g.monto;
    gastosPorCategoria[g.categoria]=(gastosPorCategoria[g.categoria]||0)+g.monto;
  });

  const pedidos=leerFilas_(SHEET_PEDIDOS,HEADERS).map(function(r){
    return {fecha:fechaTexto_(r[0]),ts:epoch_(r[0]),referencia:r[1]||'',estado:r[2]||'',nombre:r[3]||'',
      cedula:r[4]||'',celular:r[5]||'',correo:r[6]||'',ciudad:r[7]||'',direccion:r[8]||'',barrio:r[9]||'',unidad:r[10]||'',
      cantidad:Number(r[11])||0,detalle:r[12]||'',producto:Number(r[13])||0,envio:Number(r[14])||0,
      pagadoHoy:Number(r[15])||0,formaPago:r[16]||'',regalo:r[17]||'',comprobante:r[18]||'',notas:r[19]||''};
  });

  let ventas=0,ventasPendientes=0,cobrado=0,cobradoPendiente=0,unidades=0,confirmados=0,pendientes=0;
  pedidos.forEach(function(p){
    unidades+=p.cantidad;
    if(esConfirmado_(p.estado)){
      confirmados++;
      ventas+=p.producto+p.envio;
      cobrado+=p.pagadoHoy;
    }else{
      pendientes++;
      ventasPendientes+=p.producto+p.envio;
      cobradoPendiente+=p.pagadoHoy;
    }
  });

  const costoVendido=movs.filter(function(m){return m.tipo==='PEDIDO'}).reduce(function(s,m){return s+m.total},0);
  const compras=movs.filter(function(m){return m.tipo==='COMPRA'||m.tipo==='INICIAL'});
  const invertido=compras.reduce(function(s,m){return s+m.total},0);
  const valorInventario=inventarioColor.reduce(function(s,i){return s+i.valor},0);
  const utilidadBruta=ventas-costoVendido;
  const utilidadNeta=utilidadBruta-totalGastos;

  const facturas=leerFilas_(SHEET_FACTURAS,HEADERS_FAC).map(function(r,i){
    return {fila:i+2,numero:r[0]||'',fecha:fechaTexto_(r[1]),ts:epoch_(r[1]),referencia:r[2]||'',
      clienta:r[3]||'',celular:r[4]||'',ciudad:r[5]||'',detalle:r[6]||'',
      total:Number(r[7])||0,estado:r[8]||'pendiente',notas:r[9]||'',
      manual:String(r[2]||'').indexOf('MANUAL-')===0};
  });

  // Las facturas manuales (venta por aparte) tambien son ventas.
  let ventasManuales=0, cobradoManuales=0;
  facturas.forEach(function(f){
    if(f.manual && f.estado!=='anulada'){ ventasManuales+=f.total; cobradoManuales+=f.total; }
  });

  return {
    ok:true,
    generado:new Date().toISOString(),
    colores:COLORES,
    tallas:TALLAS,
    productos:productos,
    categorias:CATEGORIAS_GASTO,
    estados:ESTADOS_PEDIDO,
    estadosFactura:ESTADOS_FACTURA,
    inventario:inventario,
    inventarioColor:inventarioColor,
    ventasPorColor:Object.keys(ventasPorColor).map(function(k){return ventasPorColor[k]}),
    movimientos:movs.slice(-200).reverse().map(function(m){
      return {fila:m.fila,fecha:m.fecha,ts:m.ts,tipo:m.tipo,color:m.color,talla:m.talla,cantidad:m.cantidad,
        costoUnitario:m.costoUnitario,total:m.total,detalle:m.detalle,referencia:m.referencia};
    }),
    gastos:gastos.slice(-200).reverse(),
    gastosPorCategoria:gastosPorCategoria,
    compras:compras.map(function(m){
      return {fila:m.fila,fecha:m.fecha,ts:m.ts,tipo:m.tipo,color:m.color,talla:m.talla,cantidad:m.cantidad,
        costoUnitario:m.costoUnitario,total:m.total,detalle:m.detalle};
    }).reverse(),
    facturas:facturas.reverse(),
    pedidos:pedidos.slice(-80).reverse(),
    totales:{
      ventas:ventas+ventasManuales,ventasPedidos:ventas,ventasManuales:ventasManuales,
      ventasPendientes:ventasPendientes,cobrado:cobrado+cobradoManuales,cobradoPendiente:cobradoPendiente,
      unidades:unidades,pedidos:pedidos.length,confirmados:confirmados,pendientes:pendientes,
      costoVendido:Math.round(costoVendido),invertido:Math.round(invertido),totalGastos:Math.round(totalGastos),
      utilidadBruta:Math.round(utilidadBruta+ventasManuales),
      utilidadNeta:Math.round(utilidadBruta+ventasManuales-totalGastos),
      valorInventario:Math.round(valorInventario),facturas:facturas.length
    }
  };
}

/* ============================ UTILES ============================ */

function alerta_(stock){
  if(stock<0)return 'negativo';
  if(stock===0)return 'agotado';
  if(stock<=3)return 'bajo';
  return '';
}

function esConfirmado_(estado){
  const n=String(estado||'').toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  if(!n)return false;
  if(/pendiente|por pagar|no pagad|no confirmad|cancelad|anulad|devol/.test(n))return false;
  return /pagad|confirm|entregad|completad|finalizad/.test(n);
}

function colorCanonica_(value){
  const v=String(value==null?'':value).trim();
  if(!v)return 'Sin color';
  const norm=normaliza_(v);
  const found=COLORES.filter(function(c){return normaliza_(c)===norm})[0];
  return found||v;
}

function tallaCanonica_(value){
  const v=String(value==null?'':value).trim().toUpperCase();
  if(!v)return '';
  const found=TALLAS.filter(function(t){return t===v})[0];
  return found||v;
}

function normaliza_(value){
  return String(value||'').toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function productoCanonica_(value){
  const v=String(value==null?'':value).trim();
  if(!v)return PRODUCTO_PEDIDO;
  const lista=listarProductos_();
  const hit=lista.filter(function(p){return normaliza_(p.nombre)===normaliza_(v)})[0];
  if(hit)return hit.nombre;
  return v;
}

function leerMovimientos_(){
  return leerFilas_(SHEET_MOVIMIENTOS,HEADERS_MOV).map(function(r,i){
    const cantidad=Number(r[5])||0;
    const costoUnitario=Number(r[6])||0;
    let total=Number(r[7])||0;
    if(!total)total=cantidad*costoUnitario;
    return {fila:i+2,fecha:fechaTexto_(r[0]),ts:epoch_(r[0]),tipo:String(r[1]||'').toUpperCase(),
      producto:productoCanonica_(r[2]),color:colorCanonica_(r[3]),talla:tallaCanonica_(r[4]),
      cantidad:cantidad,costoUnitario:costoUnitario,total:total,
      detalle:r[8]||'',referencia:r[9]||''};
  });
}

function leerFilas_(name,headers){
  const sheet=getSheet_(name);
  ensureHeaders_(sheet,headers);
  const last=sheet.getLastRow();
  if(last<2)return [];
  return sheet.getRange(2,1,last-1,headers.length).getValues();
}

function fechaTexto_(value){
  if(!value)return '';
  if(Object.prototype.toString.call(value)==='[object Date]')return Utilities.formatDate(value,'America/Bogota','dd/MM/yyyy');
  return String(value);
}

function epoch_(value){
  if(!value)return 0;
  if(Object.prototype.toString.call(value)==='[object Date]')return value.getTime();
  const t=Date.parse(value);
  return isNaN(t)?0:t;
}

function assertKey_(key){
  const expected=PropertiesService.getScriptProperties().getProperty('PANEL_KEY');
  if(!expected)throw new Error('Falta configurar PANEL_KEY en las propiedades del script');
  if(String(key||'')!==expected)throw new Error('Clave incorrecta');
}

function getSpreadsheet_(){
  const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if(id)return SpreadsheetApp.openById(id);
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(active)return active;
  throw new Error('Falta SHEET_ID o el script no está vinculado al Google Sheet');
}

function getSheet_(name){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(name);
  if(!sheet&&name===SHEET_PEDIDOS)sheet=ss.getSheets()[0];
  if(!sheet)sheet=ss.insertSheet(name);
  return sheet;
}

function ensureHeaders_(sheet,headers){
  const current=sheet.getRange(1,1,1,headers.length).getValues()[0];
  if(current.join('|')!==headers.join('|')){
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
    try{
      if(!sheet.getFilter())sheet.getRange(1,1,Math.max(sheet.getLastRow(),1),headers.length).createFilter();
    }catch(e){}
  }
}

function sendEmail_(o,detail,paymentLabel){
  const email=PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  if(email)MailApp.sendEmail(email,'Nuevo pedido '+o.reference,'Pedido pendiente de comprobante\n\n'+o.customer.name+' · '+o.customer.phone+'\n'+detail+'\nCiudad: '+o.customer.city+'\nDirección: '+o.customer.address+' '+o.customer.unit+'\nPago hoy: $'+o.amountToPay+'\nForma de pago: '+paymentLabel+'\nRegalo: '+(o.gift?'Sí':'No'));
}

function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
