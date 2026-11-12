/**
 * LUCY BOUTIQUE — Pedidos, inventario, compras, gastos y dashboard
 * ---------------------------------------------------------------
 * El flujo de pedidos NO cambia: la landing sigue enviando {action:'create_order'}
 * y se sigue guardando la fila en la pestaña PEDIDOS con las mismas columnas.
 *
 * Lo nuevo:
 *   - INVENTARIO : foto del stock por color (se recalcula sola)
 *   - MOVIMIENTOS: libro de entradas y salidas (inicial, compra, venta, ajuste)
 *   - GASTOS     : empaques, pauta, transporte, etc.
 *   - Dashboard  : un solo JSON con todo para pintar el panel
 *
 * Las acciones nuevas exigen la clave PANEL_KEY (propiedad del script).
 */

const SHEET_PEDIDOS='PEDIDOS';
const SHEET_INVENTARIO='INVENTARIO';
const SHEET_MOVIMIENTOS='MOVIMIENTOS';
const SHEET_GASTOS='GASTOS';

const COLORES=['Rosa','Negro','Blanco','Gris','Café','Chocolate'];
const CATEGORIAS_GASTO=['Empaque','Pauta publicitaria','Transporte y gasolina','Impuestos y comisiones','Otros'];
const ESTADOS_PEDIDO=['PENDIENTE COMPROBANTE','PAGADO','CONTRAENTREGA ENVIADO','ENTREGADO','CANCELADO'];

const HEADERS=['Fecha','Referencia','Estado','Nombre','Cédula','Celular','Correo','Ciudad','Dirección exacta','Barrio','Apartamento o casa','Cantidad de sets','Detalle de cada sudadera','Valor de las sudaderas','Valor del envío','Valor pagado hoy','Forma de pago','Regalo','Comprobante','Notas'];
const HEADERS_INV=['Color','Stock (sets)','Costo unitario promedio','Valor en inventario','Última entrada','Actualizado'];
const HEADERS_MOV=['Fecha','Tipo','Color','Cantidad','Costo unitario','Total','Detalle','Referencia'];
const HEADERS_GAS=['Fecha','Categoría','Descripción','Monto','Notas'];

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
  o.items.forEach(function(item,index){
    const color=colorCanonica_(item.color);
    const info=state[color]||{entradas:0,costoTotal:0};
    const promedio=info.entradas>0?info.costoTotal/info.entradas:0;
    rows.push([now,'PEDIDO',color,1,promedio,promedio,'Venta '+o.reference+' · Set '+(index+1)+' · Talla '+(item.size||''),o.reference]);
  });
  if(rows.length)sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS_MOV.length).setValues(rows);
  actualizarHojaInventario_();
}

function guardarMovimiento_(raw){
  const tipo=String(raw.tipo||'COMPRA').toUpperCase();
  if(['INICIAL','COMPRA','AJUSTE','DEVOLUCION'].indexOf(tipo)<0)throw new Error('Tipo no válido');
  const color=colorCanonica_(raw.color);
  const cantidad=Number(raw.cantidad)||0;
  if(!cantidad)throw new Error('Cantidad inválida');
  const costo=Number(raw.costoUnitario)||0;
  const sheet=getSheet_(SHEET_MOVIMIENTOS);
  ensureHeaders_(sheet,HEADERS_MOV);
  sheet.appendRow([new Date(),tipo,color,cantidad,costo,cantidad*costo,raw.detalle||'',raw.referencia||'']);
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
  const colors=Object.keys(state);
  const rows=colors.map(function(color){
    const it=state[color];
    const promedio=it.entradas>0?it.costoTotal/it.entradas:0;
    return [color,it.stock,promedio,it.stock*promedio,it.ultimaEntrada||'',new Date()];
  });
  if(!rows.length)rows.push(['','','','','',new Date()]);
  sheet.getRange(2,1,rows.length,HEADERS_INV.length).setValues(rows);
  const sobrantes=sheet.getLastRow()-(1+rows.length);
  if(sobrantes>0)sheet.getRange(2+rows.length,1,sobrantes,HEADERS_INV.length).clearContent();
}

function estadoInventario_(){
  const movs=leerMovimientos_();
  const map={};
  COLORES.forEach(function(color){map[color]={color:color,stock:0,entradas:0,costoTotal:0,salidas:0,costeVendido:0,ultimaEntrada:''}});
  movs.forEach(function(m){
    if(!map[m.color])map[m.color]={color:m.color,stock:0,entradas:0,costoTotal:0,salidas:0,costeVendido:0,ultimaEntrada:''};
    const it=map[m.color];
    if(m.tipo==='PEDIDO'){
      it.stock-=m.cantidad;
      it.salidas+=m.cantidad;
      it.costeVendido+=m.total;
    }else{
      it.stock+=m.cantidad;
      it.entradas+=m.cantidad;
      it.costoTotal+=m.costoUnitario*m.cantidad;
      if(!it.ultimaEntrada||m.ts>it.tsUltima){it.ultimaEntrada=m.fecha;it.tsUltima=m.ts}
    }
  });
  return map;
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
  const movs=leerMovimientos_();
  const state=estadoInventario_();
  const colors=Object.keys(state);
  const inventario=colors.map(function(color){
    const it=state[color];
    const promedio=it.entradas>0?it.costoTotal/it.entradas:0;
    const alerta=it.stock<0?'negativo':(it.stock===0?'agotado':(it.stock<=3?'bajo':''));
    return {color:color,stock:it.stock,entradas:it.entradas,salidas:it.salidas,
      costoUnitario:Math.round(promedio),valor:Math.round(it.stock*promedio),
      ultimaEntrada:it.ultimaEntrada||'',alerta:alerta};
  });

  const ventasPorColor={};
  movs.forEach(function(m){
    if(m.tipo!=='PEDIDO')return;
    if(!ventasPorColor[m.color])ventasPorColor[m.color]={color:m.color,vendidas:0,ingresos:0};
    ventasPorColor[m.color].vendidas+=m.cantidad;
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
      celular:r[5]||'',ciudad:r[7]||'',cantidad:Number(r[11])||0,detalle:r[12]||'',
      producto:Number(r[13])||0,envio:Number(r[14])||0,pagadoHoy:Number(r[15])||0,formaPago:r[16]||''};
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
  const valorInventario=inventario.reduce(function(s,i){return s+i.valor},0);
  const utilidadBruta=ventas-costoVendido;
  const utilidadNeta=utilidadBruta-totalGastos;

  return {
    ok:true,
    generado:new Date().toISOString(),
    colores:COLORES,
    categorias:CATEGORIAS_GASTO,
    estados:ESTADOS_PEDIDO,
    inventario:inventario,
    ventasPorColor:Object.keys(ventasPorColor).map(function(k){return ventasPorColor[k]}),
    movimientos:movs.slice(-200).reverse().map(function(m){
      return {fila:m.fila,fecha:m.fecha,ts:m.ts,tipo:m.tipo,color:m.color,cantidad:m.cantidad,
        costoUnitario:m.costoUnitario,total:m.total,detalle:m.detalle,referencia:m.referencia};
    }),
    gastos:gastos.slice(-200).reverse(),
    gastosPorCategoria:gastosPorCategoria,
    compras:compras.map(function(m){
      return {fila:m.fila,fecha:m.fecha,ts:m.ts,tipo:m.tipo,color:m.color,cantidad:m.cantidad,
        costoUnitario:m.costoUnitario,total:m.total,detalle:m.detalle};
    }).reverse(),
    pedidos:pedidos.slice(-80).reverse(),
    totales:{
      ventas:ventas,ventasPendientes:ventasPendientes,cobrado:cobrado,cobradoPendiente:cobradoPendiente,
      unidades:unidades,pedidos:pedidos.length,confirmados:confirmados,pendientes:pendientes,
      costoVendido:Math.round(costoVendido),invertido:Math.round(invertido),totalGastos:Math.round(totalGastos),
      utilidadBruta:Math.round(utilidadBruta),utilidadNeta:Math.round(utilidadNeta),
      valorInventario:Math.round(valorInventario)
    }
  };
}

/* ============================ UTILES ============================ */

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

function normaliza_(value){
  return String(value||'').toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function leerMovimientos_(){
  return leerFilas_(SHEET_MOVIMIENTOS,HEADERS_MOV).map(function(r,i){
    const cantidad=Number(r[3])||0;
    const costoUnitario=Number(r[4])||0;
    let total=Number(r[5])||0;
    if(!total)total=cantidad*costoUnitario;
    return {fila:i+2,fecha:fechaTexto_(r[0]),ts:epoch_(r[0]),tipo:String(r[1]||'').toUpperCase(),
      color:colorCanonica_(r[2]),cantidad:cantidad,costoUnitario:costoUnitario,total:total,
      detalle:r[6]||'',referencia:r[7]||''};
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
