import { AccessRecorder } from "@/components/trip/access-recorder";
import { TripStepNavBarWrapper } from "@/components/trip/trip-step-nav-bar";
import { GroupRouteProvider } from "@/contexts/group-route-context";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
};

export default async function GroupLayout({ children, params }: LayoutProps) {
  const { groupId } = await params;
  return (
    <GroupRouteProvider groupId={groupId}>
      <AccessRecorder />
      <TripStepNavBarWrapper />
      {children}
    </GroupRouteProvider>
  );
}
