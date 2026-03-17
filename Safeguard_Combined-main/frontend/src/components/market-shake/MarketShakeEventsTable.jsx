import React from 'react';

const durationDays = (start, end) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86400000) + 1;
};

const MarketShakeEventsTable = ({ events, onSelectEvent, activeIndex }) => {
  if (!events?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No shake events found for current parameters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">Shake Events</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3">Start</th>
              <th className="py-2 pr-3">End</th>
              <th className="py-2 pr-3">Duration (days)</th>
              <th className="py-2 pr-3">Severity</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr
                key={`${event.start}-${event.end}-${index}`}
                className={`cursor-pointer border-b border-border/60 hover:bg-accent/40 ${activeIndex === index ? 'bg-accent/60' : ''}`}
                onClick={() => onSelectEvent(index, event)}
              >
                <td className="py-2 pr-3">{event.start}</td>
                <td className="py-2 pr-3">{event.end}</td>
                <td className="py-2 pr-3">{durationDays(event.start, event.end)}</td>
                <td className="py-2 pr-3 text-red-400">{Number(event.severity).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketShakeEventsTable;
