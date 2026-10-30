import { useState } from "react";

import { BarChart3, Download, ArrowUpRight } from "lucide-react";

import { libraryReport, reportCsv, reportRange } from "../data/libraryReports";

import { currentLibraryUser } from "../data/libraryData";

import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

import { dateKey } from "../ui/borrowWorkflow";
import { formatLoanDate } from "../ui/loanMessages";
import { useUiSettings } from "../ui/settings";

import "./StatisticsPage.css";

const messages = {
  vi: {
    title: "Thống kê thư viện",

    intro: "Theo dõi tình hình mượn trả và hoạt động thư viện.",

    from: "Từ ngày",
    to: "Đến ngày",
    days: "ngày",
    custom: "Tùy chọn",

    export: "Xuất CSV",
    exported: "Đã tạo tệp báo cáo CSV.",
    exportError: "Chưa tạo được tệp báo cáo. Hãy thử lại.",

    periodTitle: "Trong khoảng ngày đã chọn",

    periodHint:
      "Yêu cầu tính theo ngày tạo; lượt mượn theo ngày bàn giao; lượt trả theo ngày nhận trả. Mỗi phiếu tương ứng một bản sách.",

    requested: "Yêu cầu mới",
    borrowed: "Lượt bàn giao",
    returned: "Lượt nhận trả",
    readers: "Độc giả đã nhận sách",

    currentTitle: "Tình trạng hiện tại",

    currentHint:
      "Các số này tính trên toàn bộ phiếu hiện có, không phụ thuộc bộ lọc ngày. Đang mượn bao gồm cả quá hạn.",

    pending: "Chờ duyệt",
    approved: "Chờ nhận sách",
    onLoan: "Đang mượn",
    completed: "Đã trả",
    overdue: "Quá hạn",
    rejected: "Đã từ chối",
    cancelled: "Đã hủy",

    inventory: "Kho sách đang hiển thị",
    titles: "Đầu sách",
    totalCopies: "Tổng số bản",
    available: "Bản còn sẵn",

    trendTitle: "Bàn giao và nhận trả theo thời gian",

    trendHint:
      "Hai đường biểu diễn các sự kiện xảy ra trong kỳ, kể cả phiếu đã hoàn tất.",

    day: "Theo ngày",
    week: "Theo nhóm 7 ngày",
    month: "Theo tháng",

    dataTable: "Xem bảng số liệu",
    interval: "Khoảng thời gian",

    emptyTrend: "Chưa có lượt bàn giao hoặc nhận trả trong khoảng này.",

    topTitle: "5 sách được mượn nhiều nhất",

    topHint:
      "Xếp theo số lượt bàn giao trong khoảng đã chọn, có tính sách đã ẩn.",

    loans: "lượt",
    emptyTop: "Chưa có lượt bàn giao để xếp hạng.",

    overdueTitle: "Sách đang quá hạn",

    overdueHint:
      "Ưu tiên phiếu quá hạn lâu nhất. Danh sách không phụ thuộc bộ lọc ngày.",

    book: "Sách",
    reader: "Độc giả",
    due: "Hạn trả",
    late: "Số ngày quá hạn",

    emptyOverdue: "Hiện chưa có phiếu quá hạn.",

    process: "Xử lý mượn trả",
    previous: "Trang trước",
    next: "Trang sau",
    page: "Trang",

    asOf: "Cập nhật lúc",
    localTime: "Thời gian theo thiết bị.",

    missingDates:
      "phiếu thiếu thời điểm bàn giao hoặc trả. Sự kiện thiếu ngày không được cộng vào số liệu theo kỳ.",

    forbidden: "Bạn không có quyền xem hoặc xuất báo cáo này.",

    invalidRange:
      "Chọn ngày hợp lệ đến hôm nay, từ ngày không sau đến ngày và tối đa 366 ngày.",

    generated: "Thời điểm xuất",

    csvHeaders: [
      "Nhóm",
      "Chỉ tiêu",
      "Từ ngày",
      "Đến ngày / thời điểm",
      "Giá trị",
    ],
  },

  en: {
    title: "Library statistics",

    intro: "Track borrowing activity and library operations.",

    from: "From date",
    to: "To date",
    days: "days",
    custom: "Custom",

    export: "Export CSV",
    exported: "CSV report created.",
    exportError: "Unable to create the report. Please retry.",

    periodTitle: "Selected date range",

    periodHint:
      "Requests use creation dates; loans use handover dates; returns use recorded return dates. Each record represents one copy.",

    requested: "New requests",
    borrowed: "Handovers",
    returned: "Returns",
    readers: "Readers receiving books",

    currentTitle: "Current situation",

    currentHint:
      "These counts use all current records and ignore the date filter. On loan includes overdue copies.",

    pending: "Pending",
    approved: "Ready for pickup",
    onLoan: "On loan",
    completed: "Returned",
    overdue: "Overdue",
    rejected: "Rejected",
    cancelled: "Cancelled",

    inventory: "Listed inventory",
    titles: "Book titles",
    totalCopies: "Total copies",
    available: "Available copies",

    trendTitle: "Handovers and returns over time",

    trendHint:
      "Both series count events occurring during the period, including completed records.",

    day: "Daily",
    week: "7-day groups",
    month: "Monthly",

    dataTable: "View data table",
    interval: "Date range",

    emptyTrend: "No handovers or returns in this period.",

    topTitle: "5 most borrowed books",

    topHint:
      "Ranked by handovers during the selected period, including hidden books.",

    loans: "loans",
    emptyTop: "No handovers to rank yet.",

    overdueTitle: "Currently overdue",

    overdueHint:
      "Oldest overdue records first. This list ignores the date filter.",

    book: "Book",
    reader: "Reader",
    due: "Due date",
    late: "Days overdue",

    emptyOverdue: "There are no overdue loans.",

    process: "Manage loans",
    previous: "Previous",
    next: "Next",
    page: "Page",

    asOf: "Updated at",
    localTime: "Times use your device's timezone.",

    missingDates:
      "records lack handover or return timestamps. Events without dates are excluded from period figures.",

    forbidden: "You do not have permission to view or export this report.",

    invalidRange:
      "Choose valid dates up to today, in chronological order, covering no more than 366 days.",

    generated: "Exported at",

    csvHeaders: [
      "Section",
      "Metric",
      "From date",
      "To date / timestamp",
      "Value",
    ],
  },
};

function TrendChart({ report, copy, language }) {
  const items = report.trend;

  const width = 600;
  const height = 250;
  const left = 40;
  const right = 16;
  const top = 16;
  const bottom = 42;

  const max = Math.max(
    4,
    Math.ceil(
      Math.max(...items.flatMap((item) => [item.borrowed, item.returned])) / 4,
    ) * 4,
  );

  const x = (index) =>
    items.length === 1
      ? (width + left - right) / 2
      : left + (index * (width - left - right)) / (items.length - 1);

  const y = (value) =>
    height - bottom - (value * (height - top - bottom)) / max;

  const pointLabel = (item) =>
    `${item.from} → ${item.to}: ${copy.borrowed} ${item.borrowed}; ${copy.returned} ${item.returned}`;

  return (
    <>
      <div className="report-legend">
        <span>
          <i className="report-dot is-borrowed" />
          {copy.borrowed}
        </span>

        <span>
          <i className="report-dot is-returned" />
          {copy.returned}
        </span>

        <small>{copy[report.unit]}</small>
      </div>

      {report.period.borrowed + report.period.returned === 0 ? (
        <p className="report-empty">{copy.emptyTrend}</p>
      ) : (
        <div
          className="report-chart-scroll"
          tabIndex={0}
          role="region"
          aria-label={copy.trendTitle}
        >
          <svg
            className="report-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={copy.trendTitle}
          >
            <title>{copy.trendTitle}</title>

            {[0, 1, 2, 3, 4].map((tick) => (
              <g key={tick}>
                <line
                  className="report-gridline"
                  x1={left}
                  x2={width - right}
                  y1={y((max * tick) / 4)}
                  y2={y((max * tick) / 4)}
                />

                <text x={left - 9} y={y((max * tick) / 4) + 4} textAnchor="end">
                  {(max * tick) / 4}
                </text>
              </g>
            ))}

            {["borrowed", "returned"].map((series) => (
              <g key={series} className={`report-series is-${series}`}>
                <polyline
                  points={items
                    .map((item, index) => `${x(index)},${y(item[series])}`)
                    .join(" ")}
                />

                {items.map((item, index) => (
                  <circle
                    key={item.from}
                    cx={x(index)}
                    cy={y(item[series])}
                    r={3.5}
                    tabIndex={0}
                    role="img"
                    aria-label={pointLabel(item)}
                  >
                    <title>{pointLabel(item)}</title>
                  </circle>
                ))}
              </g>
            ))}

            {items.map((item, index) =>
              index === 0 ||
              index === items.length - 1 ||
              index % Math.ceil(items.length / 6) === 0 ? (
                <text
                  key={item.from}
                  x={x(index)}
                  y={height - 15}
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === items.length - 1
                        ? "end"
                        : "middle"
                  }
                >
                  {new Intl.DateTimeFormat(
                    language === "vi" ? "vi-VN" : "en-GB",
                    report.unit === "month"
                      ? {
                          month: "short",
                          year: "2-digit",
                        }
                      : {
                          day: "2-digit",
                          month: "2-digit",
                        },
                  ).format(new Date(`${item.from}T12:00:00`))}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}

      <details className="report-chart-data">
        <summary>{copy.dataTable}</summary>

        <div
          className="report-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={copy.dataTable}
        >
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{copy.interval}</th>

                <th scope="col">{copy.borrowed}</th>

                <th scope="col">{copy.returned}</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.from}>
                  <th scope="row">
                    {formatLoanDate(item.from, language)} –{" "}
                    {formatLoanDate(item.to, language)}
                  </th>

                  <td>{item.borrowed}</td>
                  <td>{item.returned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export default function StatisticsPage({ onOpenLoans }) {
  const { language } = useUiSettings();

  const copy = messages[language];
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  const [filters, setFilters] = useState(() => reportRange());

  const [preset, setPreset] = useState("30");

  const [notice, setNotice] = useState("");

  const [overduePage, setOverduePage] = useState(1);

  const report = libraryReport(data, filters);

  const canExport = hasPermission(user, P.REPORTS_EXPORT);

  const today = dateKey();

  function chooseRange(days) {
    setPreset(String(days));
    setFilters(reportRange(days));
    setNotice("");
  }

  function changeDate(name, value) {
    setPreset("custom");

    setFilters((current) => ({
      ...current,
      [name]: value,
    }));

    setNotice("");
  }

  function exportCsv() {
    const result = runLibraryCommand(P.REPORTS_EXPORT, (state) => {
      const fresh = libraryReport(state, filters);

      if (!fresh.allowed || fresh.error) {
        return {
          ok: false,
          error: fresh.error || "forbidden",
        };
      }

      let url;

      try {
        url = URL.createObjectURL(
          new Blob([reportCsv(fresh, copy)], {
            type: "text/csv;charset=utf-8",
          }),
        );

        const link = document.createElement("a");

        link.href = url;

        link.download = `cloudlibrary-report-${fresh.from}-${fresh.to}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch {
        return {
          ok: false,
          error: "exportError",
        };
      } finally {
        if (url) {
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }

      return {
        ok: true,
        state,
        targetId: "library",

        details: {
          operation: "reports.export",
          from: fresh.from,
          to: fresh.to,
          format: "csv",
        },
      };
    });

    setNotice(result.ok ? "exported" : result.error);
  }

  if (!report.allowed) {
    return <p role="alert">{copy.forbidden}</p>;
  }

  const pageCount = Math.max(1, Math.ceil((report.overdue?.length || 0) / 10));

  const currentPage = Math.min(overduePage, pageCount);

  return (
    <section className="statistics-page loan-workspace" aria-label={copy.title}>
      <div className="report-heading">
        <div>
          <h2>
            <BarChart3 size={25} aria-hidden="true" />
            {copy.title}
          </h2>

          <p>{copy.intro}</p>
        </div>

        {canExport && (
          <button
            type="button"
            className="loan-button is-primary"
            onClick={exportCsv}
            disabled={Boolean(report.error)}
          >
            <Download size={17} aria-hidden="true" />
            {copy.export}
          </button>
        )}
      </div>

      <div className="report-filters">
        <div className="report-presets" role="group" aria-label={copy.interval}>
          {[7, 30, 90].map((days) => (
            <button
              type="button"
              className="loan-button"
              key={days}
              aria-pressed={preset === String(days)}
              onClick={() => chooseRange(days)}
            >
              {days} {copy.days}
            </button>
          ))}

          {preset === "custom" && <span>{copy.custom}</span>}
        </div>

        {["from", "to"].map((name) => (
          <label className="report-field" key={name}>
            <span>{copy[name]}</span>

            <input
              type="date"
              max={today}
              value={filters[name]}
              onChange={(event) => changeDate(name, event.target.value)}
            />
          </label>
        ))}
      </div>

      {notice && (
        <p className="report-feedback" role="status">
          {copy[notice] || copy.exportError}
        </p>
      )}

      {report.error ? (
        <p className="report-error" role="alert">
          {copy[report.error]}
        </p>
      ) : (
        <>
          <div className="report-section-heading">
            <h3>{copy.periodTitle}</h3>
            <p>{copy.periodHint}</p>
          </div>

          <div className="report-metrics">
            {Object.entries(report.period).map(([key, value]) => (
              <div className="report-metric" key={key}>
                <span>{copy[key]}</span>

                <strong>
                  {value.toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}
                </strong>
              </div>
            ))}
          </div>

          {report.missingDates > 0 && (
            <p className="report-note">
              {report.missingDates} {copy.missingDates}
            </p>
          )}

          <div className="report-charts">
            <article className="report-panel">
              <h3>{copy.trendTitle}</h3>

              <p className="report-muted">{copy.trendHint}</p>

              <TrendChart report={report} copy={copy} language={language} />
            </article>

            <article className="report-panel">
              <h3>{copy.topTitle}</h3>

              <p className="report-muted">{copy.topHint}</p>

              {report.topBooks.length ? (
                <ol className="report-ranking">
                  {report.topBooks.map((book) => (
                    <li key={book.id}>
                      <div>
                        <strong>{book.title}</strong>

                        <span>
                          {book.count} {copy.loans}
                        </span>
                      </div>

                      <div className="report-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${
                              (book.count / report.topBooks[0].count) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="report-empty">{copy.emptyTop}</p>
              )}
            </article>
          </div>

          <div className="report-section-heading">
            <h3>{copy.currentTitle}</h3>
            <p>{copy.currentHint}</p>
          </div>

          <div className="report-metrics is-current">
            {["pending", "approved", "borrowed", "overdue"].map((status) => (
              <button
                type="button"
                className="report-metric"
                key={status}
                onClick={() => onOpenLoans(status)}
              >
                <span>
                  {status === "borrowed" ? copy.onLoan : copy[status]}

                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>

                <strong>{report.current[status]}</strong>
              </button>
            ))}
          </div>

          <div className="report-inventory">
            <strong>{copy.inventory}</strong>

            {Object.entries(report.stock).map(([key, value]) => (
              <span key={key}>
                {copy[key]}: <b>{value}</b>
              </span>
            ))}
          </div>

          <article className="report-panel">
            <div className="report-overdue-heading">
              <div>
                <h3>
                  {copy.overdueTitle} ({report.overdue.length})
                </h3>

                <p className="report-muted">{copy.overdueHint}</p>
              </div>

              <button
                className="loan-button"
                type="button"
                onClick={() => onOpenLoans("overdue")}
              >
                {copy.process}

                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>

            {report.overdue.length ? (
              <>
                <div
                  className="report-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={copy.overdueTitle}
                >
                  <table className="report-table">
                    <thead>
                      <tr>
                        {[copy.book, copy.reader, copy.due, copy.late].map(
                          (label) => (
                            <th scope="col" key={label}>
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {report.overdue
                        .slice((currentPage - 1) * 10, currentPage * 10)
                        .map((row) => (
                          <tr key={row.id}>
                            <th scope="row">{row.title}</th>

                            <td>
                              {row.readerName}

                              <small>{row.readerEmail}</small>
                            </td>

                            <td>{formatLoanDate(row.dueDate, language)}</td>

                            <td>
                              <strong>{row.daysLate}</strong>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <nav className="report-pagination" aria-label={copy.page}>
                  <button
                    className="loan-button"
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setOverduePage(currentPage - 1)}
                  >
                    {copy.previous}
                  </button>

                  <span>
                    {copy.page} {currentPage} / {pageCount}
                  </span>

                  <button
                    className="loan-button"
                    type="button"
                    disabled={currentPage === pageCount}
                    onClick={() => setOverduePage(currentPage + 1)}
                  >
                    {copy.next}
                  </button>
                </nav>
              </>
            ) : (
              <p className="report-empty">{copy.emptyOverdue}</p>
            )}
          </article>

          <p className="report-muted">
            {copy.asOf}:{" "}
            {new Date(report.asOf).toLocaleString(
              language === "vi" ? "vi-VN" : "en-GB",
            )}
            . {copy.localTime}
          </p>
        </>
      )}
    </section>
  );
}
