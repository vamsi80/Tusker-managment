import { Suspense } from 'react';
import { AppLoader } from '@/components/shared/app-loader';
import { CreateWorkspaceForm } from './_components/create-workspace-form';

export default function CreateWorkspacePage() {
    return (
        <Suspense fallback={<AppLoader />}>
            <CreateWorkspaceForm />
        </Suspense>
    );
}
