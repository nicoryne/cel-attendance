'use client';
import type { Tables, Enums } from '@/types/database.types';
import type React from 'react';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, CheckCircle, MoreHorizontal, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';

type VolunteerWithStatus = Tables<'volunteers'> & {
  statuses: Record<string, Enums<'attendance_status'> | null>;
  statusSummary: {
    scheduled: number;
    present: number;
    absent: number;
    total: number;
    attendanceRate: number;
  };
};

type Department = Enums<'departments'>;
type AttendanceStatus = Enums<'attendance_status'>;

export default function Overview() {
  const supabase = createClient();

  // Refs for drag scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // State
  const [volunteers, setVolunteers] = useState<VolunteerWithStatus[]>([]);
  const [gameDates, setGameDates] = useState<Tables<'game_dates'>[]>([]);
  const [volunteersByDepartment, setVolunteersByDepartment] = useState<
    Record<Department, VolunteerWithStatus[]>
  >({} as Record<Department, VolunteerWithStatus[]>);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVolunteer, setSelectedVolunteer] = useState<VolunteerWithStatus | null>(null);
  const [selectedDate, setSelectedDate] = useState<Tables<'game_dates'> | null>(null);
  const [statusToSet, setStatusToSet] = useState<AttendanceStatus>('scheduled');
  const [showInactive, setShowInactive] = useState(false);

  // Mouse drag handlers for horizontal scrolling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!tableContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - tableContainerRef.current.offsetLeft);
    setScrollLeft(tableContainerRef.current.scrollLeft);
    // Change cursor to indicate dragging
    if (tableContainerRef.current) {
      tableContainerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !tableContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableContainerRef.current.offsetLeft;
    const walk = (startX - x) * 2; // Multiply by 2 for faster scrolling
    tableContainerRef.current.scrollLeft = scrollLeft + walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Reset cursor
    if (tableContainerRef.current) {
      tableContainerRef.current.style.cursor = 'grab';
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      // Reset cursor
      if (tableContainerRef.current) {
        tableContainerRef.current.style.cursor = 'grab';
      }
    }
  };

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch game dates
      const { data: datesData, error: datesError } = await supabase
        .from('game_dates')
        .select('*')
        .order('date', { ascending: true });

      if (datesError) {
        console.error('Error fetching game dates:', datesError);
        return;
      }

      // Fetch volunteers
      const { data: volunteersData, error: volunteersError } = await supabase
        .from('volunteers')
        .select('*')
        .order('department')
        .order('last_name');

      if (volunteersError) {
        console.error('Error fetching volunteers:', volunteersError);
        return;
      }

      // Fetch all volunteer status records
      const { data: statusData, error: statusError } = await supabase
        .from('volunteer_date_status')
        .select('*');

      if (statusError) {
        console.error('Error fetching volunteer statuses:', statusError);
        return;
      }

      // Process volunteers with their statuses
      const volunteersWithStatus: VolunteerWithStatus[] = volunteersData.map((volunteer) => {
        // Get all statuses for this volunteer
        const volunteerStatuses = statusData.filter(
          (status) => status.volunteer_id === volunteer.id
        );

        // Create a map of date_id to status
        const statusMap: Record<string, AttendanceStatus | null> = {};
        datesData.forEach((date) => {
          const statusRecord = volunteerStatuses.find((s) => s.date_id === date.id);
          statusMap[date.id] = statusRecord ? statusRecord.status : null;
        });

        // Calculate status summary
        const scheduled = volunteerStatuses.filter((s) => s.status === 'scheduled').length;
        const present = volunteerStatuses.filter((s) => s.status === 'present').length;
        const absent = volunteerStatuses.filter((s) => s.status === 'absent').length;
        const total = scheduled + present + absent;
        const attendanceRate = total > 0 ? (present / total) * 100 : 0;

        return {
          ...volunteer,
          statuses: statusMap,
          statusSummary: {
            scheduled,
            present,
            absent,
            total,
            attendanceRate
          }
        };
      });

      // Group volunteers by department
      const byDepartment: Record<Department, VolunteerWithStatus[]> = {} as Record<
        Department,
        VolunteerWithStatus[]
      >;

      volunteersWithStatus.forEach((volunteer) => {
        const dept = volunteer.department || 'n/a';
        if (!byDepartment[dept]) {
          byDepartment[dept] = [];
        }
        byDepartment[dept].push(volunteer);
      });

      setGameDates(datesData);
      setVolunteers(volunteersWithStatus);
      setVolunteersByDepartment(byDepartment);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Update volunteer status
  const updateVolunteerStatus = async (
    volunteerId: string,
    dateId: string,
    status: AttendanceStatus
  ) => {
    // Check if a status record already exists
    const { data: existingStatus } = await supabase
      .from('volunteer_date_status')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .eq('date_id', dateId)
      .single();

    let result;

    if (existingStatus) {
      // Update existing status
      result = await supabase
        .from('volunteer_date_status')
        .update({ status })
        .eq('volunteer_id', volunteerId)
        .eq('date_id', dateId);
    } else {
      // Insert new status
      result = await supabase.from('volunteer_date_status').insert({
        volunteer_id: volunteerId,
        date_id: dateId,
        status
      });
    }

    if (result.error) {
      console.error('Error updating status:', result.error);
      return;
    }

    // Update local state
    setVolunteers((prev) => {
      return prev.map((volunteer) => {
        if (volunteer.id === volunteerId) {
          return {
            ...volunteer,
            statuses: {
              ...volunteer.statuses,
              [dateId]: status
            },
            statusSummary: {
              ...volunteer.statusSummary,
              [status]: volunteer.statusSummary[status] + 1,
              total: volunteer.statusSummary.total + (existingStatus ? 0 : 1)
            }
          };
        }
        return volunteer;
      });
    });
  };

  // Remove volunteer status
  const removeVolunteerStatus = async (volunteerId: string, dateId: string) => {
    // Delete the status record
    const { error } = await supabase
      .from('volunteer_date_status')
      .delete()
      .eq('volunteer_id', volunteerId)
      .eq('date_id', dateId);

    if (error) {
      console.error('Error removing status:', error);
      return;
    }

    // Update local state
    setVolunteers((prev) => {
      return prev.map((volunteer) => {
        if (volunteer.id === volunteerId) {
          const currentStatus = volunteer.statuses[dateId];
          // Only update counts if there was a status
          const statusSummary = { ...volunteer.statusSummary };

          if (currentStatus) {
            statusSummary[currentStatus] = Math.max(0, statusSummary[currentStatus] - 1);
            statusSummary.total = Math.max(0, statusSummary.total - 1);
          }

          return {
            ...volunteer,
            statuses: {
              ...volunteer.statuses,
              [dateId]: null
            },
            statusSummary
          };
        }
        return volunteer;
      });
    });
  };

  // Filter volunteers based on search and department
  const filteredVolunteers = volunteers.filter((volunteer) => {
    const matchesSearch =
      searchQuery === '' ||
      `${volunteer.first_name} ${volunteer.last_name}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesDepartment =
      selectedDepartment === 'all' || volunteer.department === selectedDepartment;

    const matchesActiveStatus = showInactive || volunteer.is_active;

    return matchesSearch && matchesDepartment && matchesActiveStatus;
  });

  // Get departments for dropdown
  const departments = Object.keys(volunteersByDepartment) as Department[];

  // Status color mapping
  const statusColors: Record<AttendanceStatus, string> = {
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    present: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    absent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
  };

  // Status icon mapping
  const StatusIcon = ({ status }: { status: AttendanceStatus | null }) => {
    if (!status) return null;

    switch (status) {
      case 'scheduled':
        return <CalendarIcon className="h-4 w-4 text-blue-500" />;
      case 'present':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'absent':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d');
    } catch (e) {
      return dateString;
    }
  };

  return (
    <>
      <div className="bg-background absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)] dark:bg-[radial-gradient(#171717_1px,transparent_1px)]" />
      <main className="container mx-auto mt-24 px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Volunteer Attendance Overview</h1>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Filters</CardTitle>
            <CardDescription>Filter volunteers by department, name, or status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                  <Input
                    type="search"
                    placeholder="Search volunteers..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <Select
                value={selectedDepartment}
                onValueChange={(value) => setSelectedDepartment(value as Department | 'all')}
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept.charAt(0).toUpperCase() + dept.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowInactive(!showInactive)}
                  className={showInactive ? 'bg-primary text-primary-foreground' : ''}
                >
                  {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Volunteers Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Volunteers</CardTitle>
            <CardDescription>{filteredVolunteers.length} volunteers found</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="border-primary h-12 w-12 animate-spin rounded-full border-b-2"></div>
              </div>
            ) : (
              <Tabs defaultValue="table" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="table">Table View</TabsTrigger>
                  <TabsTrigger value="department">Department View</TabsTrigger>
                </TabsList>

                <TabsContent value="table" className="w-full">
                  <div
                    ref={tableContainerRef}
                    className="scrollbar-thin relative z-10 cursor-grab overflow-x-scroll rounded-md border"
                    style={{
                      overflowX: 'auto',
                      scrollbarWidth: 'thin',
                      WebkitOverflowScrolling: 'touch'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                  >
                    <Table className="min-w-max">
                      <TableHeader className="bg-background sticky top-0 z-20">
                        <TableRow>
                          <TableHead className="bg-background sticky left-0 w-[150px] md:w-[250px]">
                            Volunteer
                          </TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Status</TableHead>
                          {gameDates.map((date) => (
                            <TableHead key={date.id} className="text-center">
                              {formatDate(date.date)}
                            </TableHead>
                          ))}
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVolunteers.map((volunteer) => (
                          <TableRow
                            key={volunteer.id}
                            className={!volunteer.is_active ? 'opacity-60' : ''}
                          >
                            <TableCell className="bg-background sticky left-0 z-10 font-medium">
                              <div className="flex w-[150px] flex-col md:w-[250px]">
                                <span className="hidden md:block">
                                  {volunteer.last_name}, {volunteer.first_name}
                                </span>
                                <span className="block md:hidden">
                                  {volunteer.last_name}, {volunteer.first_name.charAt(0)}.
                                </span>
                                {!volunteer.is_active && (
                                  <Badge variant="outline" className="mt-1 w-fit">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {volunteer.department ? (
                                <Badge variant="secondary">
                                  {volunteer.department.charAt(0).toUpperCase() +
                                    volunteer.department.slice(1)}
                                </Badge>
                              ) : (
                                <Badge variant="outline">N/A</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-medium">Attendance:</span>
                                  <span className="text-xs">
                                    {volunteer.statusSummary.attendanceRate.toFixed(0)}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                  <span className="text-xs">{volunteer.statusSummary.present}</span>
                                  <div className="ml-2 h-2 w-2 rounded-full bg-red-500"></div>
                                  <span className="text-xs">{volunteer.statusSummary.absent}</span>
                                  <div className="ml-2 h-2 w-2 rounded-full bg-blue-500"></div>
                                  <span className="text-xs">
                                    {volunteer.statusSummary.scheduled}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            {gameDates.map((date) => {
                              const status = volunteer.statuses[date.id];
                              return (
                                <TableCell key={date.id} className="text-center">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        {status ? (
                                          <StatusIcon status={status} />
                                        ) : (
                                          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
                                        )}
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Update Status</DialogTitle>
                                        <DialogDescription>
                                          Set attendance status for {volunteer.first_name}{' '}
                                          {volunteer.last_name} on {formatDate(date.date)}
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="grid gap-4 py-4">
                                        <Select
                                          value={status || 'scheduled'}
                                          onValueChange={(value) =>
                                            updateVolunteerStatus(
                                              volunteer.id,
                                              date.id,
                                              value as AttendanceStatus
                                            )
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="scheduled">Scheduled</SelectItem>
                                            <SelectItem value="present">Present</SelectItem>
                                            <SelectItem value="absent">Absent</SelectItem>
                                          </SelectContent>
                                        </Select>

                                        {status && (
                                          <Button
                                            variant="destructive"
                                            onClick={() => {
                                              removeVolunteerStatus(volunteer.id, date.id);
                                            }}
                                          >
                                            Unschedule
                                          </Button>
                                        )}
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedVolunteer(volunteer);
                                    }}
                                  >
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      // Toggle active status
                                      const updateVolunteer = async () => {
                                        const { error } = await supabase
                                          .from('volunteers')
                                          .update({ is_active: !volunteer.is_active })
                                          .eq('id', volunteer.id);

                                        if (!error) {
                                          setVolunteers((prev) =>
                                            prev.map((v) =>
                                              v.id === volunteer.id
                                                ? { ...v, is_active: !v.is_active }
                                                : v
                                            )
                                          );
                                        }
                                      };

                                      updateVolunteer();
                                    }}
                                  >
                                    {volunteer.is_active ? 'Mark as Inactive' : 'Mark as Active'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="department" className="w-full">
                  {departments.map((dept) => {
                    const deptVolunteers = volunteersByDepartment[dept].filter(
                      (v) =>
                        (showInactive || v.is_active) &&
                        (searchQuery === '' ||
                          `${v.first_name} ${v.last_name}`
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()))
                    );

                    if (selectedDepartment !== 'all' && dept !== selectedDepartment) {
                      return null;
                    }

                    if (deptVolunteers.length === 0) {
                      return null;
                    }

                    return (
                      <Card key={dept} className="mb-6">
                        <CardHeader>
                          <CardTitle>
                            {dept.charAt(0).toUpperCase() + dept.slice(1)}
                            <Badge className="ml-2">{deptVolunteers.length}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {deptVolunteers.map((volunteer) => (
                              <Card
                                key={volunteer.id}
                                className={!volunteer.is_active ? 'opacity-70' : ''}
                              >
                                <CardHeader className="pb-2">
                                  <div className="flex items-start justify-between">
                                    <CardTitle className="text-lg">
                                      {volunteer.last_name}, {volunteer.first_name}
                                    </CardTitle>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedVolunteer(volunteer);
                                          }}
                                        >
                                          View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            // Toggle active status
                                            const updateVolunteer = async () => {
                                              const { error } = await supabase
                                                .from('volunteers')
                                                .update({ is_active: !volunteer.is_active })
                                                .eq('id', volunteer.id);

                                              if (!error) {
                                                setVolunteers((prev) =>
                                                  prev.map((v) =>
                                                    v.id === volunteer.id
                                                      ? { ...v, is_active: !v.is_active }
                                                      : v
                                                  )
                                                );
                                              }
                                            };

                                            updateVolunteer();
                                          }}
                                        >
                                          {volunteer.is_active
                                            ? 'Mark as Inactive'
                                            : 'Mark as Active'}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  {!volunteer.is_active && (
                                    <Badge variant="outline" className="w-fit">
                                      Inactive
                                    </Badge>
                                  )}
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">Attendance Rate:</span>
                                      <span className="text-sm">
                                        {volunteer.statusSummary.attendanceRate.toFixed(0)}%
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">Present:</span>
                                      <span className="text-sm">
                                        {volunteer.statusSummary.present}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">Absent:</span>
                                      <span className="text-sm">
                                        {volunteer.statusSummary.absent}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">Scheduled:</span>
                                      <span className="text-sm">
                                        {volunteer.statusSummary.scheduled}
                                      </span>
                                    </div>

                                    <div className="pt-2">
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <Button variant="outline" size="sm" className="w-full">
                                            Schedule
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                          <DialogHeader>
                                            <DialogTitle>Schedule Volunteer</DialogTitle>
                                            <DialogDescription>
                                              Set attendance status for {volunteer.first_name}{' '}
                                              {volunteer.last_name}
                                            </DialogDescription>
                                          </DialogHeader>
                                          <div className="grid gap-4 py-4">
                                            <Select
                                              onValueChange={(value) =>
                                                setSelectedDate(
                                                  gameDates.find((d) => d.id === value) || null
                                                )
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue placeholder="Select date" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {gameDates.map((date) => (
                                                  <SelectItem key={date.id} value={date.id}>
                                                    {formatDate(date.date)}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>

                                            {selectedDate && (
                                              <Select
                                                value={statusToSet}
                                                onValueChange={(value) =>
                                                  setStatusToSet(value as AttendanceStatus)
                                                }
                                              >
                                                <SelectTrigger>
                                                  <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="scheduled">
                                                    Scheduled
                                                  </SelectItem>
                                                  <SelectItem value="present">Present</SelectItem>
                                                  <SelectItem value="absent">Absent</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            )}
                                          </div>
                                          <DialogFooter>
                                            <Button
                                              onClick={() => {
                                                if (selectedDate) {
                                                  updateVolunteerStatus(
                                                    volunteer.id,
                                                    selectedDate.id,
                                                    statusToSet
                                                  );
                                                  setSelectedDate(null);
                                                }
                                              }}
                                              disabled={!selectedDate}
                                            >
                                              Save
                                            </Button>
                                            {selectedDate &&
                                              volunteer.statuses[selectedDate.id] && (
                                                <Button
                                                  variant="destructive"
                                                  onClick={() => {
                                                    if (selectedDate) {
                                                      removeVolunteerStatus(
                                                        volunteer.id,
                                                        selectedDate.id
                                                      );
                                                      setSelectedDate(null);
                                                    }
                                                  }}
                                                >
                                                  Unschedule
                                                </Button>
                                              )}
                                          </DialogFooter>
                                        </DialogContent>
                                      </Dialog>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Volunteer Detail Dialog */}
        {selectedVolunteer && (
          <Dialog
            open={!!selectedVolunteer}
            onOpenChange={(open) => {
              if (!open) setSelectedVolunteer(null);
            }}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Volunteer Details</DialogTitle>
                <DialogDescription>
                  Detailed information for {selectedVolunteer.first_name}{' '}
                  {selectedVolunteer.last_name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-lg font-medium">Personal Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Name:</span>
                      <span>
                        {selectedVolunteer.first_name} {selectedVolunteer.last_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Department:</span>
                      <span>{selectedVolunteer.department || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge variant={selectedVolunteer.is_active ? 'default' : 'outline'}>
                        {selectedVolunteer.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>

                  <h3 className="mt-4 mb-2 text-lg font-medium">Attendance Summary</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Attendance Rate:</span>
                      <span>{selectedVolunteer.statusSummary.attendanceRate.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Present:</span>
                      <span>{selectedVolunteer.statusSummary.present}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Absent:</span>
                      <span>{selectedVolunteer.statusSummary.absent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Scheduled:</span>
                      <span>{selectedVolunteer.statusSummary.scheduled}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total:</span>
                      <span>{selectedVolunteer.statusSummary.total}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-lg font-medium">Attendance History</h3>
                  <div className="max-h-[300px] overflow-y-auto pr-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gameDates.map((date) => {
                          const status = selectedVolunteer.statuses[date.id];
                          return (
                            <TableRow key={date.id}>
                              <TableCell>{formatDate(date.date)}</TableCell>
                              <TableCell>
                                {status ? (
                                  <div className="flex items-center gap-2">
                                    <StatusIcon status={status} />
                                    <span className="capitalize">{status}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Not set</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={status || ''}
                                    onValueChange={(value) => {
                                      if (value) {
                                        updateVolunteerStatus(
                                          selectedVolunteer.id,
                                          date.id,
                                          value as AttendanceStatus
                                        );
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-[120px]">
                                      <SelectValue placeholder="Set status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="scheduled">Scheduled</SelectItem>
                                      <SelectItem value="present">Present</SelectItem>
                                      <SelectItem value="absent">Absent</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {status && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() =>
                                        removeVolunteerStatus(selectedVolunteer.id, date.id)
                                      }
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Toggle active status
                    const updateVolunteer = async () => {
                      const { error } = await supabase
                        .from('volunteers')
                        .update({ is_active: !selectedVolunteer.is_active })
                        .eq('id', selectedVolunteer.id);

                      if (!error) {
                        setVolunteers((prev) =>
                          prev.map((v) =>
                            v.id === selectedVolunteer.id ? { ...v, is_active: !v.is_active } : v
                          )
                        );
                        setSelectedVolunteer((prev) =>
                          prev ? { ...prev, is_active: !prev.is_active } : null
                        );
                      }
                    };

                    updateVolunteer();
                  }}
                >
                  {selectedVolunteer.is_active ? 'Mark as Inactive' : 'Mark as Active'}
                </Button>
                <Button onClick={() => setSelectedVolunteer(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </>
  );
}
