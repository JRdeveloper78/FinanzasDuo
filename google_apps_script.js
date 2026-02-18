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
        const jsonString = e.postData.contents;
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

        // Guardamos todo el estado JSON en la celda A1 para simplicidad
        sheet.getRange("A1").setValue(jsonString);

        return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
