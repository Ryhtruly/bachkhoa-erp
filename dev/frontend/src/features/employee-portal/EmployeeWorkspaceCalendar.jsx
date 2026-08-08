import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import viLocale from '@fullcalendar/core/locales/vi'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export default function EmployeeWorkspaceCalendar() {
  const calendarRef = useRef(null)

  const navigate = (action) => {
    calendarRef.current?.getApi()[action]()
  }

  return <section className="employee-workspace-calendar">
    <div className="employee-workspace-calendar__header">
      <h1><CalendarDays size={19} />Lịch làm việc tuần này</h1>
      <div className="employee-workspace-calendar__controls" aria-label="Điều hướng lịch">
        <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => navigate('prev')} aria-label="Tuần trước" title="Tuần trước"><ChevronLeft size={18} /></button>
        <button type="button" className="employee-workspace-calendar__today" onClick={() => navigate('today')} aria-label="Hiện tại"><CalendarDays size={16} />Hiện tại</button>
        <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => navigate('next')} aria-label="Tuần sau" title="Tuần sau"><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="employee-workspace-calendar__body">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin]}
        locale={viLocale}
        initialView="timeGridWeek"
        firstDay={1}
        headerToolbar={false}
        allDaySlot={false}
        slotMinTime="07:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelContent={(arg) => {
          if (arg.date.getHours() === 7 && arg.date.getMinutes() === 0) return 'Sáng'
          if (arg.date.getHours() === 13 && arg.date.getMinutes() === 0) return 'Chiều'
          return ''
        }}
        slotLaneClassNames={(arg) => arg.date.getHours() === 13 && arg.date.getMinutes() === 0 ? ['employee-workspace-calendar__afternoon'] : []}
        dayHeaderContent={(arg) => <>
          <span className="employee-workspace-calendar__weekday">{new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(arg.date)}</span>
          <span className="employee-workspace-calendar__date">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(arg.date)}</span>
        </>}
        height={620}
        expandRows
        events={[]}
      />
    </div>
  </section>
}
