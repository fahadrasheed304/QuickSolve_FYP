import ScheduledClassDetails from '@/components/scheduled-class-details'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ScheduledClassDetails id={id} role="student"/>}
