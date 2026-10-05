import { DailySchedule } from '@/components/daily-schedule';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default function Page(){return <main style={{padding:28,background:'#f7f8fc',minHeight:'100vh'}}><Link href="/">← Volver a FNET</Link><DailySchedule/></main>;}
