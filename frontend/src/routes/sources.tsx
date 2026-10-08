import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sources')({
  component: () => <Outlet />,
})
