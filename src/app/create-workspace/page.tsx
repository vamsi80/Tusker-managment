"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { workSpaceSchema, WorkSpaceSchemaType } from '@/lib/zodSchemas'
import { Loader2, PlusIcon, SparkleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Resolver } from 'react-hook-form';
import slugify from "slugify";
import { useConfetti } from '@/hooks/use-confetti'
import { tryCatch } from '@/hooks/try-catch'
import { Textarea } from '@/components/ui/textarea'
import { createWorkSpace } from './action'

export const CreateWorkspace = () => {

    const [Pending, startTransition] = useTransition();
    const router = useRouter();
    const { triggerConfetti } = useConfetti();

    const form = useForm<WorkSpaceSchemaType>({
        resolver: zodResolver(workSpaceSchema) as unknown as Resolver<WorkSpaceSchemaType>,
        defaultValues: {
            name: " ",
            description: '',
            slug: '',
        },
    })

    function onSubmit(values: WorkSpaceSchemaType) {

        startTransition(async () => {
            const { data: result, error } = await tryCatch(createWorkSpace(values));
            console.log("results", { result });

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                triggerConfetti();
                form.reset();
                router.push("/workspace");
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Create Work Space
                </CardTitle>
                <CardDescription>
                    Create your work space to manage your work
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form
                        className="space-y-6"
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Title"{...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className=" flex gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="slug"
                                render={({ field }) => (
                                    <FormItem className="w-full">
                                        <FormLabel>Slug</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Slug"{...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="button" className="w-fit" onClick={() => {
                                const nameValue = form.getValues("name");
                                const slug = slugify(nameValue)

                                form.setValue('slug', slug, { shouldValidate: true })
                            }}>
                                Generate Slug <SparkleIcon className="ml-1" size={16} />
                            </Button>
                        </div>
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descreption</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Small Descreption"
                                            className="min-h-[20px]"{...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={Pending}>
                            {
                                Pending ? (
                                    <>
                                        Creating...
                                        <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                    </>
                                ) : (
                                    <>
                                        Create WorkSpace
                                        <PlusIcon className="ml-1" size={16} />
                                    </>
                                )
                            }
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    )
}

export default CreateWorkspace;
