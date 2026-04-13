import { TripStepNavBarWrapper } from "@/components/trip/trip-step-nav-bar";
import { AccessRecorder } from "@/components/trip/access-recorder";

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AccessRecorder />
      <TripStepNavBarWrapper />
      {children}
    </>
  );
}
