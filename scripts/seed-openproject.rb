# Runs inside the disposable OpenProject container via `rails runner`; prints KEY=<api key>.
admin = User.admin.active.where.not(login: nil).first
admin.update_columns(language: "en")
Setting.journal_aggregation_time_minutes = 0
key = Token::API.create!(user: admin).plain_value

project = Project.create!(name: "Operator live", identifier: "operator-live", workspace_type: "project", enabled_module_names: %w[work_package_tracking costs])
project.types << Type.first
role = Role.find_by!(name: "Project admin")
Member.create!(project: project, principal: admin, roles: [role])

alice = User.new(login: "alice", firstname: "Alice", lastname: "Tester", mail: "alice@example.test", status: Principal.statuses[:active])
alice.password = alice.password_confirmation = "Alice-Password-123!"
alice.save!
Member.create!(project: project, principal: alice, roles: [role])

seed = WorkPackage.create!(project: project, type: project.types.first, subject: "seed", author: alice, status: Status.default, priority: IssuePriority.default)

# The journal jobs of the creation above delete notifications created while they run.
deadline = Time.current + 90
pending = -> { GoodJob::Job.where(finished_at: nil).where("scheduled_at IS NULL OR scheduled_at <= ?", Time.current) }
sleep 1 while pending.call.exists? && Time.current < deadline
3.times { Notification.create!(recipient: admin, actor: alice, reason: :mentioned, resource: seed, journal: seed.journals.last, read_ian: false) }

puts "KEY=#{key}"
