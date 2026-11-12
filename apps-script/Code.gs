const HEADERS=['Fecha','Referencia','Estado','Nombre','Cédula','Celular','Correo','Ciudad','Dirección exacta','Barrio','Apartamento o casa','Cantidad de sets','Detalle de cada sudadera','Valor de las sudaderas','Valor del envío','Valor pagado hoy','Forma de pago','Regalo','Comprobante','Notas'];

function doGet(){return json_({ok:true,service:'Lucy Boutique pedidos'})}

function doPost(e){
  try{
    const raw=JSON.parse(e.postData.contents||'{}');
    if(raw.action!=='create_order')return json_({ok:false,error:'Acción inválida'});
    const o=normalizeOrder_(raw);
    validate_(o);
    reconcileTotals_(o);
    const sheet=getSheet_();
    ensureHeaders_(sheet);
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
    return json_({ok:true,reference:o.reference});
  }catch(error){return json_({ok:false,error:error.message})}
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

function getSheet_(){const active=SpreadsheetApp.getActiveSpreadsheet();if(active)return active.getSheets()[0];const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw new Error('Falta SHEET_ID o el script no está vinculado al Google Sheet');return SpreadsheetApp.openById(id).getSheets()[0]}
function ensureHeaders_(sheet){const current=sheet.getRange(1,1,1,HEADERS.length).getValues()[0];if(current.join('|')!==HEADERS.join('|')){sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');if(!sheet.getFilter())sheet.getRange(1,1,Math.max(sheet.getLastRow(),1),HEADERS.length).createFilter()}}
function sendEmail_(o,detail,paymentLabel){const email=PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');if(email)MailApp.sendEmail(email,'Nuevo pedido '+o.reference,'Pedido pendiente de comprobante\n\n'+o.customer.name+' · '+o.customer.phone+'\n'+detail+'\nCiudad: '+o.customer.city+'\nDirección: '+o.customer.address+' '+o.customer.unit+'\nPago hoy: $'+o.amountToPay+'\nForma de pago: '+paymentLabel+'\nRegalo: '+(o.gift?'Sí':'No'))}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
