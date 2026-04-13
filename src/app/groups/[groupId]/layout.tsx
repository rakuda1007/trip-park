import { TripStepNavBarWrapper } from "@/components/trip/trip-step-nav-bar";

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TripStepNavBarWrapper />
      {children}
    </>
  );
}
