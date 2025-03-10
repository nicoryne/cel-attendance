'use client';

import type React from 'react';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import { Check, Clock, Search, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Database, Enums } from '@/types/database.types';

type Volunteer = Database['public']['Tables']['volunteers']['Row'];
type Department = Database['public']['Enums']['departments'];
type AttendanceStatus = Database['public']['Enums']['attendance_status'];

type VolunteerWithStatus = Volunteer & {
  status: AttendanceStatus | null;
};

export default function Home() {
  const supabase = createClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Volunteer[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [todayDate, setTodayDate] = useState<string>('');
  const [todayDateId, setTodayDateId] = useState<string | null>(null);
  const [scheduledVolunteers, setScheduledVolunteers] = useState<
    Record<Department, VolunteerWithStatus[]>
  >({} as Record<Department, VolunteerWithStatus[]>);
  const [loading, setLoading] = useState(true);
  const [markingPresent, setMarkingPresent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Format today's date in ISO format (YYYY-MM-DD)
      const today = new Date();
      const formattedDate = format(today, 'yyyy-MM-dd');

      // Try to fetch today's date record
      let { data: dateData, error: dateError } = await supabase
        .from('game_dates')
        .select('*')
        .eq('date', formattedDate)
        .eq('is_active', true)
        .single();

      // If no date for today, find the nearest future date
      if (dateError && dateError.code === 'PGRST116') {
        const { data: futureDate, error: futureDateError } = await supabase
          .from('game_dates')
          .select('*')
          .eq('is_active', true)
          .gt('date', formattedDate)
          .order('date', { ascending: true })
          .limit(1)
          .single();

        if (!futureDateError) {
          dateData = futureDate;
        } else {
          // If no future date, try to get the most recent past date
          const { data: pastDate, error: pastDateError } = await supabase
            .from('game_dates')
            .select('*')
            .eq('is_active', true)
            .lt('date', formattedDate)
            .order('date', { ascending: false })
            .limit(1)
            .single();

          if (!pastDateError) {
            dateData = pastDate;
          }
        }
      }

      if (dateData) {
        setTodayDate(dateData.date);
        setTodayDateId(dateData.id);

        // Fetch all volunteers
        const { data: volunteersData, error: volunteersError } = await supabase
          .from('volunteers')
          .select('*')
          .eq('is_active', true)
          .order('first_name');

        if (volunteersError) {
          console.error('Error fetching volunteers:', volunteersError);
          setLoading(false);
          return;
        }

        setVolunteers(volunteersData);

        // Fetch volunteer statuses for the selected date
        const { data: statusData, error: statusError } = await supabase
          .from('volunteer_date_status')
          .select('*')
          .eq('date_id', dateData.id);

        if (statusError) {
          console.error('Error fetching volunteer statuses:', statusError);
          setLoading(false);
          return;
        }

        // Group volunteers by department and add status
        const byDepartment: Record<Department, VolunteerWithStatus[]> = {} as Record<
          Department,
          VolunteerWithStatus[]
        >;

        // First, get all scheduled volunteers for the date
        const scheduledVolunteerIds = statusData
          .filter((status) => status.status === 'scheduled' || status.status === 'present')
          .map((status) => status.volunteer_id);

        // Filter volunteers to only include those scheduled for the date
        const scheduledVolunteersData = volunteersData.filter((volunteer) =>
          scheduledVolunteerIds.includes(volunteer.id)
        );

        // Group by department
        scheduledVolunteersData.forEach((volunteer) => {
          const dept = (volunteer.department as Enums<'departments'>) || 'n/a';
          if (!byDepartment[dept]) {
            byDepartment[dept] = [];
          }

          // Find status for this volunteer
          const volunteerStatus = statusData.find((status) => status.volunteer_id === volunteer.id);

          byDepartment[dept].push({
            ...volunteer,
            status: volunteerStatus ? volunteerStatus.status : null
          });
        });

        setScheduledVolunteers(byDepartment);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  // Handle input change for autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (value.length > 0) {
      // Filter volunteers based on input
      const filtered = volunteers.filter((volunteer) =>
        `${volunteer.first_name} ${volunteer.last_name}`.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
    } else {
      setSuggestions([]);
    }
  };

  // Handle volunteer selection from suggestions
  const handleSelectVolunteer = (volunteer: Volunteer) => {
    setInputValue(`${volunteer.first_name} ${volunteer.last_name}`);
    setSuggestions([]);

    // Focus on the input after selection
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Mark volunteer as present
  const markAsPresent = async () => {
    if (!inputValue || !todayDateId) return;

    setMarkingPresent(true);

    // Find volunteer by name
    const selectedVolunteer = volunteers.find(
      (volunteer) =>
        `${volunteer.first_name} ${volunteer.last_name}`.toLowerCase() === inputValue.toLowerCase()
    );

    if (!selectedVolunteer) {
      alert('Volunteer not found. Please select a volunteer from the suggestions.');
      setMarkingPresent(false);
      return;
    }

    // Check if volunteer is already marked for today
    const { data: existingStatus } = await supabase
      .from('volunteer_date_status')
      .select('*')
      .eq('volunteer_id', selectedVolunteer.id)
      .eq('date_id', todayDateId)
      .single();

    let result;

    if (existingStatus) {
      // Update existing status to present
      result = await supabase
        .from('volunteer_date_status')
        .update({ status: 'present' })
        .eq('volunteer_id', selectedVolunteer.id)
        .eq('date_id', todayDateId);
    } else {
      // Insert new status
      result = await supabase.from('volunteer_date_status').insert({
        volunteer_id: selectedVolunteer.id,
        date_id: todayDateId,
        status: 'present'
      });
    }

    if (result.error) {
      console.error('Error updating status:', result.error);
      alert('Failed to mark volunteer as present. Please try again.');
      setMarkingPresent(false);
      return;
    }

    // Update local state
    setScheduledVolunteers((prev) => {
      const dept = selectedVolunteer.department || 'n/a';
      const newState = { ...prev };

      // If department exists in state
      if (newState[dept]) {
        // Check if volunteer is already in the list
        const volunteerIndex = newState[dept].findIndex((v) => v.id === selectedVolunteer.id);

        if (volunteerIndex >= 0) {
          // Update existing volunteer
          newState[dept][volunteerIndex].status = 'present';
        } else {
          // Add volunteer to the list
          newState[dept].push({
            ...selectedVolunteer,
            status: 'present'
          });
        }
      } else {
        // Create new department entry
        newState[dept] = [
          {
            ...selectedVolunteer,
            status: 'present'
          }
        ];
      }

      return newState;
    });

    // Reset input
    setInputValue('');
    setSuggestions([]);
    setMarkingPresent(false);
  };

  // Format time for display
  const formatTime = (date: Date) => {
    return format(date, 'h:mm:ss a');
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  return (
    <>
      <div className="bg-background absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)] dark:bg-[radial-gradient(#171717_1px,transparent_1px)]" />
      <main className="container mx-auto mt-24 px-4 py-8 md:mt-16">
        <h1 className="mb-6 text-3xl font-bold">Volunteer Attendance</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Left Side - Input Form */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Mark Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="relative">
                  <div className="relative">
                    <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Enter volunteer name..."
                      className="pl-9"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          markAsPresent();
                        }
                      }}
                    />
                  </div>

                  {suggestions.length > 0 && (
                    <div className="bg-background absolute z-10 mt-1 w-full rounded-md border shadow-lg">
                      <ul className="max-h-60 overflow-auto py-1">
                        {suggestions.map((volunteer) => (
                          <li
                            key={volunteer.id}
                            className="hover:bg-muted cursor-pointer px-4 py-2"
                            onClick={() => handleSelectVolunteer(volunteer)}
                          >
                            {volunteer.first_name} {volunteer.last_name}
                            {volunteer.department && (
                              <Badge variant="outline" className="ml-2">
                                {volunteer.department}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={markAsPresent}
                  disabled={!inputValue || markingPresent || !todayDateId}
                >
                  {markingPresent ? 'Processing...' : 'Mark as Present'}
                </Button>

                {!todayDateId && (
                  <div className="text-destructive mt-2 text-center text-sm">
                    No game dates found. Please create one in the admin panel.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Side - Current Time and Scheduled Volunteers */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Current Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-3xl font-bold">{formatTime(currentTime)}</div>
                  <div className="text-muted-foreground mt-2">{formatDate(currentTime)}</div>

                  {todayDate && todayDate !== format(currentTime, 'yyyy-MM-dd') && (
                    <div className="mt-4 rounded-md bg-amber-100 p-2 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                      Showing schedule for {format(new Date(todayDate), 'EEEE, MMMM d, yyyy')}
                      <div className="text-xs">(No game scheduled for today)</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scheduled Volunteers</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-40 items-center justify-center">
                    <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
                  </div>
                ) : !todayDateId ? (
                  <div className="text-muted-foreground text-center">
                    No active game date for today
                  </div>
                ) : Object.keys(scheduledVolunteers).length === 0 ? (
                  <div className="text-muted-foreground text-center">
                    No volunteers scheduled for today
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(scheduledVolunteers).map(([dept, volunteers]) => (
                      <div key={dept}>
                        <h3 className="mb-2 text-lg font-medium capitalize">{dept}</h3>
                        <div className="space-y-2">
                          {volunteers.map((volunteer) => (
                            <div
                              key={volunteer.id}
                              className={`flex items-center justify-between rounded-md border p-3 ${
                                volunteer.status === 'present' ? 'bg-primary/10' : 'opacity-70'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="font-medium">
                                  {volunteer.first_name} {volunteer.last_name}
                                </div>
                              </div>
                              <div>
                                {volunteer.status === 'present' ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                    <Check className="mr-1 h-3 w-3" />
                                    Present
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Scheduled</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
