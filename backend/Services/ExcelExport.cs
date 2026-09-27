using ClosedXML.Excel;

namespace FraudDetection.Api.Services;

// Builds real .xlsx workbooks (not CSV) for the analyst dashboard's "Export to Excel" buttons.
public static class ExcelExport
{
    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public record Sheet(string Name, string[] Headers, IEnumerable<object?[]> Rows);

    public static byte[] Workbook(string title, params Sheet[] sheets)
    {
        using var wb = new XLWorkbook();
        wb.Properties.Title = title;
        wb.Properties.Author = "Arclight Fraud Operations";

        foreach (var s in sheets)
        {
            var ws = wb.AddWorksheet(s.Name.Length > 31 ? s.Name[..31] : s.Name);
            for (var c = 0; c < s.Headers.Length; c++)
            {
                var cell = ws.Cell(1, c + 1);
                cell.Value = s.Headers[c];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#3B1275");
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            }

            var r = 2;
            foreach (var row in s.Rows)
            {
                for (var c = 0; c < row.Length; c++)
                {
                    var cell = ws.Cell(r, c + 1);
                    switch (row[c])
                    {
                        case null: break;
                        case DateTime d: cell.Value = d; cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm:ss"; break;
                        case int i: cell.Value = i; break;
                        case long l: cell.Value = l; break;
                        case double db: cell.Value = db; break;
                        case decimal m: cell.Value = m; cell.Style.NumberFormat.Format = "#,##0.00"; break;
                        case bool b: cell.Value = b ? "Yes" : "No"; break;
                        default: cell.Value = row[c]?.ToString(); break;
                    }
                }
                if (r % 2 == 1) ws.Row(r).Style.Fill.BackgroundColor = XLColor.FromHtml("#F7F6FD");
                r++;
            }

            ws.SheetView.FreezeRows(1);
            if (r > 2) ws.Range(1, 1, r - 1, s.Headers.Length).SetAutoFilter();
            ws.Columns().AdjustToContents(1, Math.Min(r, 200));
            foreach (var col in ws.ColumnsUsed()) if (col.Width > 70) col.Width = 70;
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
