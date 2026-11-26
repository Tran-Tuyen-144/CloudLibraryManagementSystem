export function commandSpec(command, input) {
  if (!input || typeof input !== "object") throw new Error("Invalid input");
  const id = input.id;
  switch (command) {
    case "reservation.create":
      if (!input.bookId) throw new Error("Missing book ID");
      return {command, input:{bookId:input.bookId}};
    case "reservation.cancel":
      if (!id) throw new Error("Missing reservation ID");
      return {command,input:{id}};
    case "copy.update":
      if (!id || !["available","maintenance"].includes(input.status)) throw new Error("Invalid copy update");
      return {command,input:{id,status:input.status}};
    case "loan.action":
      if (!id || !Number.isSafeInteger(input.version) || !["renew-request","renew-approve","renew-reject","collect-fine"].includes(input.action)) throw new Error("Invalid loan action");
      return {command,input:{id,version:input.version,action:input.action,...(input.reason ? {reason:input.reason} : {})}};
    case "notification.read":
      if (!Array.isArray(input.ids) || input.ids.some(x=>typeof x!=="string")) throw new Error("Invalid notification IDs");
      return {command,input:{ids:input.ids,...(id ? {id} : {})}};
    default: throw new Error("Unsupported command");
  }
}
export function projectAccountSnapshot(data, user) {
  if (!data || data.session?.email !== user.email || !Array.isArray(data.reservations) || !Array.isArray(data.bookCopies) || !Array.isArray(data.notifications) || !data.settings || !data.requestsByEmail || Array.isArray(data.requestsByEmail)) throw new Error("Invalid authenticated snapshot");
  const staff = ["admin","librarian"].includes(user.role);
  const loans = Object.entries(data.requestsByEmail).flatMap(([email,rows])=>{
    if (!Array.isArray(rows)) throw new Error("Invalid loan snapshot");
    return rows.map(row=>({...row,readerEmail:email}));
  });
  const reservations = data.reservations.filter(row=>staff || row.readerEmail===user.email);
  return {reservations, copies:staff?data.bookCopies:[], settings:data.settings,
    loans:loans.filter(row=>row.readerEmail===user.email), managed:staff?loans:[],
    notifications:data.notifications.filter(row=>row.readerEmail===user.email).map(row=>({...row,at:row.createdAt,requestId:row.targetId,target:row.type?.startsWith("reservation")?"reservations":"loans"})).sort((a,b)=>String(b.at).localeCompare(String(a.at)))};
}
