/**
 * FinanzasDuo - Google Apps Script Bridge
 * 
 * INSTRUCCIONES:
 * 1. Abre un Google Sheet nuevo.
 * 2. Ve a 'Extensiones' > 'Apps Script'.
 * 3. Pega este código y guarda.
 * 4. Haz clic en 'Implementar' > 'Nueva implementación'.
 * 5. Tipo: 'Aplicación web'.
 * 6. Quién tiene acceso: 'Cualquiera'.
 * 7. Copia la URL resultante y pégala en los ajustes de FinanzasDuo.
 */

function doGet(e) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getRange("A1").getValue();

    return ContentService.createTextOutput(data || "{}")
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    try {
        let jsonString = e.postData ? e.postData.contents : null;

        // Si viene como parámetro (algunos métodos de envío)
        if (!jsonString && e.parameter.data) {
            jsonString = e.parameter.data;
        }

        if (!jsonString) throw new Error("No data received");

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        sheet.getRange("A1").setValue(jsonString);

        return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
