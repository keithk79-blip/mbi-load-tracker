import { rowsFromSeedCsv, type CallOffLogEntry } from "../lib/callOffLog";

/** Snapshot of the dispatcher Call-Off sheet as of 2026-09-15. Local seed only. */
export const CALL_OFF_LOG_SEED_CSV = `Name,Call Off,Through Date,Reason
Shakey Sinks,8/14/26,,ok'd to do 1 load
Mike Smith,8/14/26,,P-Day
Paul Pizarro,8/15/26,,ok'd off
Baldemar Murga,8/15/26,,ok'd off
Bryan Alvarado,8/15/26,,Ok'd Off
Daniel Alvarado,8/15/26,,Ok'd Off
Francisco Ramirez,8/15/26,,Vacation Day
Jose Leal Del Real,8/17/26,,ok'd to come in at noon
Jim Carter,8/17/26,,P-Day
Brian Toledo,8/18/26,,FMLA Day
Brandon Smith,8/19/26,,"Ok'd to come in late, 11am"
Jerron Dove,8/19/26,,P-Day
Ivan Estrada,8/19/26,,ok'd to do 2 loads
Ubaldo Montiel,8/19/26,,P-Day
Martell Beasley,8/19/26,,"ok'd to come in late, kid going to school"
Markeith nunnally,8/19/26,,P-Day
Alex Acosta,8/19/26,,"Ok'd to park empty, need trailer work"
Oscar Galvan,8/21/26,,ok'd to park by 3 pm
Alberto Nieto,8/21/26,,P-Day
Ariel Sanchez,8/21/26,,needing to park by noon
Brandon Smith,8/22/26,,ok'd off
Kody Gustafson,8/24/26,,ok'd to park by 3:30pm
Brandon Smith,8/24/26,,"Call Off, taking kid to school"
Wojo Kubala,8/25/26,,P-Day
Jovan Morris,8/26/26,8/29/2026,"ok'd off, told when hired"
Calos Montenegro,8/27/26,,Parked by Noon
Calos Montenegro,8/28/26,,P-Day
Ray Martin,8/28/26,,Ok'd Off
Randy Mesarchik,8/29/26,,Ok'd Off
Jim Schroeder,9/1/26,,"Last Day , retiring"
Ralp Grant,9/1/2026,,P-Day
Mike Martinez,9/2/26,,ok'd to park by 1pm
Reginald Dishmon,9/2/26,,ok;d to park early
Reginald Dishmon,9/3/26,,P-Day
Candido Antunez,9/3/26,,"dr. apt in the morning, coming in after. "
Fernando Flores,9/4/26,,Ok'd to do 2 loads
Oscar Galvan,9/4/26,,ok'd to park by 3 pm
Tim Rozzoni,9/4/26,,P-Day
Reginald Dishmon,9/4/26,,P-Day
Jose Cadenas,9/4/2026,,P-Day
Fernando Flores,9/5/26,,ok'd off
Markeith nunnally,9/5/26,,Ok'd off
Markeith nunnally,9/8/26,,P-Day
Mike Davy,9/8/26,,P-day
Agustin Baca Guzman,9/8/26,,Jury Duty
Derek Winters,9/9/26,9/14/2026,"Ok'd off, when hired"
Hank Kingpavong,9/9/26,,Parked by 1:30pm
Kody Gustafson,9/9/26,,needs to park by 1pm
Johnnie Owens,9/9/26,,Parked by 2:30pm
Pablo Cruz,9/11/26,,"Bereavement, father died"
Bill Sinks,9/11/26,,"1 Load, taking bobbie to hospital"
Pablo Cruz,9/12/26,,"Bereavement, father died"
Pablo Cruz,9/14/26,,"Bereavement, father died"
John Maxedon,9/14/26,,P-Day
Chris Washington,9/14/26,,ok'd to park at noon
Chris Washington,9/15/26,,Call Off
Zavier Alexander,9/15/26,,Ok'd Off
Kody Gustafson,9/15/26,,parked by 3pm
Marvin Alvarez,9/15/26,,"Court at 9am, will be in after"
Kody Gustafson,9/16/26,,parked by 3pm
Mark Kubala,9/16/26,,P-Day
Mark Kubala,9/17/26,,Vacation Day
Shelton Webb,9/18/26,,P-Day
Reice Carter,9/18/26,,"ok'd off, uncles funeral"
Pat Baxter,9/18/26,,Parked by noon
Dan Kasper,9/18/26,9/19/2026,P-day
Michael Martinez,9/18/26,,Ok'd to park at 2pm.
Steve Miller,9/18/26,,Needs to park by noon
Oscar Galvan,9/19/26,,ok'd off
Nigel Stewart,9/19/26,,ok'd off
Reice Carter,9/19/26,,"ok'd off, uncles funeral"
Kody Gustafson,9/21/26,,parked by 4pm
Carl Boyd,9/22/26,,"Ok'd to park by noon, court. "
Paul Pizarro,9/23/26,9/25/2026,Call Off
Bob Fedderman,9/25/26,,P-Day
Marco Cabrera,9/25/26,,ok'd off.
Juan Quintana,9/25/26,,ok'd to do 2 loads.
Mike Davy,9/25/26,,Ok'd Off
Britton McKay,9/28/26,,P-Day
Adam Hernandez,10/2/26,,P-day
Oscar Galvan,10/3/26,,ok'd off
Adam Hernandez,10/5/26,,P-Day
Paul Tiemens,10/9/26,,P-Day
Bogdan Wojtowicz,10/9/26,,P-Day
Paul Tiemens,10/10/26,,ok'd off
Bob Fedderman,10/19/26,,1 vacation day
Bogdan Wojtowicz,10/19/26,,P-Day
Bob Fedderman,10/20/26,,1 vacation day
Mark Kubala,11/1/26,,"Last Day, Retiring"
Emile Spearman,11/27/26,,P-Day
Emile Spearman,11/28/26,,P-Day
Bob Fedderman,1/2/27,,1 P-Day
Oscar Galvan,9/26/26,,Ok'd Off
`;

export function callOffLogSeedRows(): CallOffLogEntry[] {
  return rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV);
}
